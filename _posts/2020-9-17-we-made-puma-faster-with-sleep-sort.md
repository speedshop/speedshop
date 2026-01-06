---
layout: post
title: "We Made Puma Faster With Sleep Sort"
date: 2020-09-17 0:00:00
summary: "Puma 5 is a huge major release for the project. It brings several new experimental performance features, along with tons of bugfixes and features. Let's talk about some of the most important ones."
readtime: 1839 words / 7 minutes
wordcount: 1839
image: puma5.png
---

Puma 5 (codename Spoony Bard{% sidenote 1 "When Puma gets a new 'supercontributor' that submits lots of important work to the project, we let them name the next release. This release features a lot of code from Will Jordan, who named this release 'Spoony Bard'. Will said: 'Final Fantasy IV is especially nostalgic for me, the first big open-source project I ever worked on was a fan re-translation of the game back in the late 90s.'" %}) was released today (my birthday!). There's a lot going on in this release, so I wanted to talk about the different features and changes to give Puma users confidence in upgrading. 

## Experimental Performance Features For Cluster Mode on MRI

This is probably the headline of the release - two features for reducing memory usage, and one for reducing latency.

Puma 5 contains 3 new experimental performance features:

* `wait_for_less_busy_worker` config. This may reduce latency on MRI through inserting a small delay (sleep sort!) before re-listening on the socket if worker is busy. Intended result: If enabled, should reduce latency in high-load (>50% utilization) Puma clusters.
* `fork_worker` option and `refork` command for reduced memory usage by forking from a worker process instead of the master process. Intended result: If enabled, should reduce memory usage.
* Added `nakayoshi_fork` config option. Reduce memory usage in preloaded cluster-mode apps by GCing before fork and compacting, where available. Intended result: If enabled, should reduce memory usage.

All of these experiments are only for **cluster mode** Puma configs running on **MRI**.

We're calling them _experimental_ because we're not sure if they'll actually have any benefit. We're pretty sure they're stable and won't break anything, but we're not sure they're actually going to have big benefits in the real world. People's workloads are often not what we anticipate, and synthetic benchmarks are usually not of any help in figuring out if a change will be beneficial or not.

We do not believe any of the new features will have a negative effect or impact the stability of your application. This is either a "it works" or "it does nothing" experiment.

If any of the features turn out to be particularly beneficial, we may make them defaults in future versions of Puma.

**If you upgrade and try any of the 3 new features, please post before and after results or screenshots to [this Github issue](https://github.com/puma/puma/issues/2258).** "It didn't do anything" is still a useful report in this case. Posting ~24 hours of "before" and ~24 hours of "after" data would be most helpful.

### wait_for_less_busy_worker: sleep sort for faster apps?!

This feature was contributed to Puma by Gitlab. Turn it on by adding `wait_for_less_busy_worker` to your Puma config.

When a request comes in to a Puma cluster, the operating system randomly selects a listening, free Puma worker process to pick up the request. "Listening" and "free" being the key words - a Puma process will only listen to the socket (and pick up more requests) if it has nothing else to do. However, when running Puma with multiple threads, Puma will also listen on the socket when all of its busy threads are waiting on I/O or have otherwise released [the Global VM Lock](/2020/05/11/the-ruby-gvl-and-scaling.html).

When Gitlab investigated switching from Unicorn to Puma, they encountered an issue with this behavior. Under high load with moderate thread settings (a max pool size of 5 in their case), average request latency increased. Why?

Remember, I said that the operating system _randomly_ assigns a request to a _listening_ worker process. So, it will never send a request to a worker process that's busy doing other things, but what about a worker process that's got 4 threads that are processing other requests, but all 4 of those threads happen to be waiting on I/O right now?

Imagine a Puma cluster with 3 workers:

* Worker 1: 0/5 threads busy.
* Worker 2: 1/5 threads busy.
* Worker 3: 4/5 threads busy.

If Worker 3's 4 active threads happen to all have released the GVL, allowing that worker to listen to the socket, and a new request comes in - which worker process should we assign the request to, ideally? Worker 1, right? Unfortunately, most operating systems will assign the request to Worker 3 33% of the time.

So, what do we do? We want the operating system to prefer less-loaded workers. It would be really cool if we could sort the list of workers listening on the socket so that the operating system would give requests to the least-loaded worker. Well, we can't really do that easily, but we can do something else.

`wait_for_less_busy_worker` causes a worker to _wait_ to re-listen on the socket if it's thread pool isn't completely empty. This means that in high-load scenarios, the operating system will assign requests to less-loaded workers.

**This is basically sleep-sorting our workers**. We're kind of doing doing this: 

```
[].tap { |a| workers.map { |e| Thread.new{ sleep worker_busyness.to_f/1000; a << e} }.each{|t| t.join} }
```

... and hiding "more loaded" workers from the operating system by letting less-loaded workers listen first!

Originally the proposal was for a more complicated sort - processes slept longer if they had more busy threads - but that was removed when it was found that a simpler on/off sleep was just as effective. 

The net effect is that in high-load scenarios, request latency decreases. This is because workers with more busy threads are slower than workers with no busy threads. We're assuring that requests get assigned to the faster workers. Prior to this patch, Gitlab saw an increase in latency using Puma compared to Unicorn - after this patch, latency was the same (they also were able to reduce their fleet size by almost 30% thanks to Puma's memory-saving multithreaded design).

There may be even more efficient ways for us to implement this behavior in the future. There's some magic you can do with `libev`, I'm pretty sure, or we can just implement a different sleep/wait strategy.

### fork_worker 

Adding `fork_worker` to your puma.rb config file (or `--fork-worker` from the CLI) turns on this feature. This mode causes Puma to fork additional workers from worker 0, instead of directly from the master process:

```
10000   \_ puma 5.0.0 (tcp://0.0.0.0:9292) [puma]
10001       \_ puma: cluster worker 0: 10000 [puma]
10002           \_ puma: cluster worker 1: 10000 [puma]
10003           \_ puma: cluster worker 2: 10000 [puma]
10004           \_ puma: cluster worker 3: 10000 [puma]
```

Similar to the `preload_app!` option, the `fork_worker` option allows your application to be initialized only once for copy-on-write memory savings, and it has two additional advantages:

1. **Compatible with phased restart.** Because the master process itself doesn't preload the application, this mode works with phased restart (`SIGUSR1` or `pumactl phased-restart`), unlike `preload_app!`. When worker 0 reloads as part of a phased restart, it initializes a new copy of your application first, then the other workers reload by forking from this new worker already containing the new preloaded application.

This allows a phased restart to complete as quickly as a hot restart (`SIGUSR2` or `pumactl restart`), while still minimizing downtime by staggering the restart across cluster workers.

2. **'Refork' for additional copy-on-write improvements in running applications.** Fork-worker mode introduces a new `refork` command that re-loads all nonzero workers by re-forking them from worker 0.

This command can potentially improve memory utilization in large or complex applications that don't fully pre-initialize on startup, because the re-forked workers can share copy-on-write memory with a worker that has been running for a while and serving requests.

You can trigger a refork by sending the cluster the `SIGURG` signal or running the `pumactl refork` command at any time. A refork will also automatically trigger once, after a certain number of requests have been processed by worker 0 (default 1000). To configure the number of requests before the auto-refork, pass a positive integer argument to `fork_worker` (e.g., `fork_worker 1000`), or `0` to disable.

### nakayoshi_fork 

Add `nakayoshi_fork` to your puma.rb config to try this option.

Nakayoshi means "friendly", so this is a "friendly fork". The concept was [originally implemented by MRI supercontributor Koichi Sasada](https://github.com/ko1/nakayoshi_fork) in a gem, but we wanted to see if we could bring a simpler version into Puma.

Basically, we just do the following before forking a worker:

```ruby
4.times { GC.start }
GC.compact # if available
```

The concept here is that we're trying to get as clean of a Ruby heap as possible before forking to maximize [copy-on-write](https://en.wikipedia.org/wiki/Copy-on-write) benefits. That should, in turn, lead to reduced memory usage.

## Other New Features 

A few more things in the grab-bag:

* You can now compile Puma on machines where OpenSSL is not installed.
* There is now a `thread-backtraces` command in pumactl to print all active threads backtraces. This has been available via SIGINFO on Darwin, but now it works on Linux via this new command.
* `Puma.stats` now has a `requests_count` counter.
* `lowlevel_error_handler` got some enhancements - we also pass the status code to it now.
* Phased restarts and worker timeouts should be faster.
* `Puma.stats_hash` provides Puma statistics as a hash, rather than as JSON.

## Loads of Bugfixes

The number of bugfixes in this release is pretty huge. Here's the most important ones:

* Shutdowns should be more reliable.
* Issues surrounding socket closing on shutdown have been resolved.
* Fixed some concurrency bugs in the Reactor.
* `out_of_band` should be much more reliable now.
* Fixed an issue users were seeing with ActionCable and not being able to start a server.
* Many stability improvements to `prune_bundler`.

## Nicer Internals and Tests

This release has seen a massive improvement to our test coverage. We've pretty much doubled the size of the test suite since 4.0, and it's way more stable and reproducible now too.

A number of breaking changes come with this major release. [For the complete list, see the HISTORY file.](https://github.com/puma/puma/blob/master/History.md)

## Thanks to Our Contributors!

This release is our first major or minor release with new maintainer MSP-Greg on the team. Greg has been doing tons of work on the test suite to make it more reliable, as well as a lot of work on our SSL features to bring them up-to-date and more extendable. Greg is also our main Windows expert.

The following people contributed more than 10 commits to this release:

* [Tim Morgan](https://github.com/seven1m)
* [Vyacheslav Alexeev](https://github.com/alexeevit)
* [Will Jordan](https://github.com/wjordan)
* [Jeff Levin](https://github.com/jalevin)
* [Patrik Ragnarsson](https://github.com/dentarg), who's also been very helpful in our Issues tracker.

If you've like to make a contribution to Puma, please see our [Contributors Guide](https://github.com/puma/puma/blob/master/CONTRIBUTING.md). We're always looking for more help and try to make it as easy as possible to contribute.

Enjoy Puma 5!