---
layout: post
title:  "The Complete Guide to Rails Caching"
summary: Caching in a Rails app is a little bit like that one friend you sometimes have around for dinner, but should really have around more often.
readtime: 5989 words/30 minutes
wordcount: 5989
---

Caching in a Rails app is a little bit like that one friend you sometimes have around for dinner, but should really have around more often. Nearly every Rails app that's serious about performance could use more caching, but most Rails apps eschew it entirely! And yet, intelligent use of caching is usually the only path to achieving fast server response times in Rails - easily speeding up ~250ms response times to 50-100ms.

A quick note on definitions - this post will only cover "application"-layer caching. I'm leaving HTTP caching (which is a whole nother beast, and not even necessary implemented *in* your application) for another day.

### Why don't we cache as much as we should?

Developers, by our nature, are very different from end-users. We understand a lot about what happens behind the scenes in software and web applications. We know that when a typical webpage loads, a lot of code is run, database queries executed, and sometimes services pinged over HTTP. That takes time. We're used to the idea that when you interact with a computer, it takes a little while for the computer to come back with an answer.

End-users are completely different. Your web application is a magical box. End-users have no idea what happens inside of that box.{% marginnote_lazy https://i.imgur.com/X17puIB.gif | Developer perception of end-users.|true %} Especially these days, **end-users expect near-instantaneous response from our magical boxes**. Most end-users wanted whatever they're trying to get out of your web-app *yesterday*.

This rings of a truism. Yet, we never set hard performance requirements in our user stories and product specifications. Even though server response time is easy to measure and target, and we know users want fast webpages, we fail to ever say for a particular site or feature: "This page should return a response within 100ms." As a result, performance often gets thrown to the wayside in favor of the next user story, the next great big feature. Performance debt, like technical debt, mounts quickly. **Performance never really becomes a priority until the app is basically in flames** every time someone makes a new request.

In addition, caching isn't always easy. **Cache *expiration* especially can be a confusing topic**. Bugs in caching behavior tend to happen at the integration layer, usually the least-tested layer of your application. This makes caching bugs insidious and difficult to find and reproduce.

To make matters worse, **caching best practices seem to be frequently changing** in the Rails world. Key-based what? Russian mall caching? Or was it doll?

### Benefits of Caching

So why cache? The answer is simple. Speed. With Ruby, we don't get speed for free because our language isn't very fast to begin with {% marginnote_lazy https://i.imgur.com/UDkHBEc.png|Ruby performance in the Benchmarks Game vs Javascript. %} . We have to get speed from *executing less Ruby on each request*. The easiest way to do that is with caching. Do the work once, cache the result, serve the cached result in the future.

But how fast do we need to be, really?

[Guidelines for human-computer interaction have been known since computers were first developed in the 1960s](http://theixdlibrary.com/pdf/Miller1968.pdf). The response-time threshold for a user to feel as if they are *freely navigating* your site, without waiting for the site to load, is 1 second or less. That's not a 1-second *response time*, but 1 second *"to glass"* - 1 second from the instant the user clicked or interacted with the site until that interaction is complete (the DOM finishes painting).

1 second "to-glass" is not a very long time. First, figure about 50 milliseconds for network latency (this is on desktop, latency on mobile is a whole other discussion). Then, budget another 150ms for loading your JS and CSS resources, building the render tree and painting. Finally, figure *at least* 250 ms for the execution of all the Javascript you've downloaded, and potentially much more than that if your Javascript has a lot of functions tied to the DOM being ready. So before we're even ready to consider how long the server has to respond, we're already about ~500ms in the hole. **In order to consistently achieve a 1 second to glass webpage, server responses should be kept below 300ms.** For a 100-ms-to-glass webpage, [as covered in another post of mine](/blog/100-ms-to-glass-with-rails-and-turbolinks/), server responses must be kept at around 25-30ms.

300ms per request is not impossible to achieve without caching on a Rails app, especially if you've been diligent with your SQL queries and use of ActiveRecord. But it's a heck of a lot of easier if you do use caching. Most Rails apps I've seen have at least a half dozen pages in the app that consistently take north of 300ms to respond, and could benefit from some caching. In addition, using heavy frameworks in addition to Rails, like Spree, the popular e-commerce framework, can slow down responses significantly due to all the extra Ruby execution they add to each request. Even popular heavyweight gems, like Devise or ActiveAdmin, add thousands of lines of Ruby to each request cycle.

Of course, there will always be areas in your app where caching can't help - your POST endpoints, for example. If whatever your app does in response to a POST or PUT is extremely complicated, caching probably won't help you. But if that's the case, consider moving the work into a background worker instead (a blog post for another day).

### Getting started

First, [Rails' official guide on caching](http://guides.rubyonrails.org/caching_with_rails.html) is excellent regarding the technical details of Rails' various caching APIs. If you haven't yet, give that page a full read-through.

Later on in the article, I'm going to discuss the different caching backends available to you as a Rails developer. Each has their advantages and disadvantages - some are slow but offer sharing between hosts and servers, some are fast but can't share the cache at all, not even with other processes. Everyone's needs are different. In short, the default cache store, ```ActiveSupport::Cache::FileStore``` is OK, but if you you're going to follow the techniques used in this guide (especially key-based cache expiration), you need to switch to a different cache store eventually.

As a tip to newcomers to caching, my advice is to **ignore action caching and page caching**. The situations where these two techniques can be used is so narrow that these features were removed from Rails as of 4.0. I recommend instead getting very comfortable with fragment caching - which I'll cover in detail now.

## Profiling Performance

### Reading the Logs

Alright, you've got your cache store set up and you're ready to go. But what to cache?

This is where profiling comes in. Rather than trying to guess "in the dark" what areas of your application are performance hotspots, we're going to fire up a profiling tool to tell us exactly what parts of the page are slow.

My preferred tool for this task is the incredible [rack-mini-profiler](https://github.com/MiniProfiler/rack-mini-profiler). `rack-mini-profiler` provides an excellent line-by-line breakdown of where *exactly* all the time goes during a particular server response.

However, we don't even have to use `rack-mini-profiler` or even any other profiling tools if we're too lazy and don't want to - Rails provides a total time for page generation out of the box in the logs {% marginnote_lazy https://i.imgur.com/wTHHYbr.png %} . It'll look something like this:

```
Completed 200 OK in 110ms (Views: 65.6ms | ActiveRecord: 19.7ms)
```

The total time (110ms in this case) is the important one. The amount of time spent in Views is a total of the time spent in your template files (index.html.erb for example). But this can be a little misleading, thanks to how ActiveRecord::Relations lazily loads your data. If you're defining an instance variable with an ActiveRecord::Relation, such as `@users = User.all`, in the controller, but don't do anything with that variable until you start using it's results in the view (e.g. `@users.each do ...`), then that query (and reification into ActiveRecord objects), will be counted in the Views number. ActiveRecord::Relations are *lazily loaded*, meaning the database query isn't executed until the results are actually accessed (usually in your view).

The ActiveRecord number here is also misleading - as far as I can tell from reading the Rails source, this is *not* the amount of time spent executing Ruby in ActiveRecord (building the query, executing the query, and turning the query results into ActiveRecord objects), but only the time spent querying the database (so the actual time spent in DB). Sometimes, especially with very complicated queries that use a lot of eager loading, turning the query result into ActiveRecord objects takes a *lot* of time, and that may not be reflected in the ActiveRecord number here.

And where'd the rest of the time go? Rack middleware and controller code mostly. But to get a millisecond-by-millisecond breakdown of *exactly* where your time goes during a request, you'll need `rack-mini-profiler` and the `flamegraph` extension {% marginnote_lazy https://i.imgur.com/h3ZvWGm.png|What the flamegraph looks like in rack-mini-profiler %}. Using that tool, you'll be able to see exactly where every millisecond of your time goes during a request on a line-by-line basis. I'm working on a guide for using `rack-mini-profiler` - if you'd like to hear about that guide when it comes out, be sure to sign up for my newsletter (bottom right).

### Production Mode

Whenever I profile Rails apps for performance, **I always do it in production mode**. Not *on* production, of course, but with `RAILS_ENV=production`. Running in production mode ensures that my local environment is close to what the end-user will experience, and also disables code reloading and asset compilation, two things which will massively slow down any Rails request in development mode. Even better if you can use Docker to perfectly mimic the configuration of your production environment. For instance, if you're on Heroku, Heroku recently released some Docker images to help you - but usually virtualization is a mostly unnecessary step in achieving production-like behavior. Mostly, we just need to make sure we're running the Rails server in production mode.

As a quick refresher, here's what you usually have to do to get a Rails app running in production mode on your local machine:

```
export RAILS_ENV=production
rake db:reset
rake assets:precompile
SECRET_KEY_BASE=test rails s
```

In addition, **where security and privacy concerns permit, I always test with a copy of production data**. All too often, database queries in development (like User.all) return just 100 or so sample rows, but in production, trigger massive 100,000 row results that can bring a site crashing to its knees. Either use production data or make your seed data as realistic as possible. This is *especially* important when you're making extensive use of `includes` and Rails' eager loading facilities.

### Setting a Goal

Finally, I suggest **setting a maximum acceptable average response time, or MAART, for your site**. The great thing about performance is that it's usually quite measurable - and what gets measured, gets managed! You may need two MAART numbers - one that is achievable in development, with your developer hardware, and one that you use in production, with production hardware.

Unless you have an extremely 1-to-1 production/development setup, using virtualization to control cpu and memory access, you simply will not be able to duplicate performance results across those two environments (though you can come close). That's OK - don't get tripped up by the details. You just need to be sure that your page performance is in the right ballpark.

As an example, let's say we want to build a 100ms-to-glass web app [like in my previous post](/blog/100-ms-to-glass-with-rails-and-turbolinks/). That requires server response times of 25-50ms. So I'd set my MAART in development to be 25ms, and in production, I'd slacken that to about 50ms. My development machine is a little faster than a Heroku dyne (my typical deployment environment), so I give it a little extra time on production.

I'm not aware of any tools yet to do automated testing against your maximum acceptable average response time. We have to do that (for now) manually using benchmarking tools.

### Apache Bench

So, how do we decide what our site's actual average response time is in development? I've only described to you how to read response times from the logs - so is the best way to hit "refresh" in your browser a few times and take your best guess at the average result? Nope.

This is where benchmarking tools like `wrk` and `Apache Bench` come in. `Apache Bench`, or `ab`, is my favorite, so I'll quickly describe how to use it. You can install it on Homebrew with `brew install ab`.{% sidenote 1 "<i>I've been told you may need to 'brew tap homebrew/apache' first for this to work.</i>" %}

Start your server in production mode, as described earlier. Then fire up Apache Bench with the following settings:

```
ab -t 10 http://localhost:3000/
```

Obviously, you'll need to change that URL out as appropriate. The -t option controls how long we're going to benchmark for (in seconds).

Here's some example output from Apache Bench, abridged for clarity:

```
...
Requests per second:    161.04 [#/sec] (mean)
Time per request:       12.419 [ms] (mean)
Time per request:       6.210 [ms] (mean, across all concurrent requests)
...

Percentage of the requests served within a certain time (ms)
  50%     12
  66%     13
  75%     13
  80%     13
  90%     14
  95%     15
  98%     17
  99%     18
 100%     21 (longest request)
```

The "time per request" would be the number we compare against our MAART. If you also have a 95th percentile goal (95 percent of requests must be faster than X), you can get the comparable time from the chart at the end, next to "95%". Neat, huh?

For a full listing of things you can do with Apache Bench, check out the man page. Notable other options include SSL support, KeepAlive, and POST/PUT support.

Of course, the great thing about this tool is that you can also use it against your production server! If you want to benchmark heavy loads though, it's probably best to run it against your staging environment instead, so that your customers aren't affected!

From here, the workflow is simple - **I don't cache anything unless I'm not meeting my MAART**. If my page is slower than my set MAART, I dig in with `rack-mini-profiler` to see exactly which parts of the page are slow.{% marginnote_lazy https://imgur.com/gtMaUPI.png|Breakdown in rack-mini-profiler %} In particular, I look for areas where a lot of SQL is being executed unnecessarily on every request, or where a lot of code is executed repeatedly.

## Caching techniques

### Key-based cache expiration

Writing and reading from the cache is pretty easy - again, if you don't know the basics of it, [check out the Rails Guide on this topic](http://guides.rubyonrails.org/caching_with_rails.html). **The complicated part of caching is knowing when to expire caches**.

In the old days, Rails developers used to do a lot of manual cache expiration, with Observers and Sweepers. Nowadays, we try to avoid these entirely, and instead use something called *key-based expiration*.

Recall that a cache is simply a collection of keys and values, just like a Hash. In fact, we use hashes as caches all the time in Ruby. Key-based expiration is a cache expiration strategy that expires entries in the cache by making the *cache key* contain information about the *value being cached*, such that when the object changes (in a way that we care about), the cache key for the object also changes. We then leave it to the cache store to expire the (now unused) previous cache key. We never expire entries in the cache manually.

In the case of an ActiveRecord object, we know that every time we change an attribute and save the object to the database, that object's `updated_at` attribute changes. So we can use `updated_at` in our cache keys when caching ActiveRecord objects  - each time the ActiveRecord object changes, it's updated_at changes, busting our cache. Thankfully, Rails knows this and makes it very easy for us.

For example, let's say I have a Todo item. I can cache it like this:

```
<% todo = Todo.first %>
<% cache(todo) do %>
  ... a whole lot of work here ...
<% end %>
```

When you give an ActiveRecord object to `cache`, Rails realizes this and generates a cache key that looks a lot like this:

```
views/todos/123-20120806214154/7a1156131a6928cb0026877f8b749ac9
```

The `views` bit is self-explanatory. The `todos` part is based on the Class of the ActiveRecord object. The next bit is a combination of the `id` of the object (123 in this case) and the `updated_at` value (some time in 2012). The final bit is what's called the template tree digest. This is just an md5 hash of the template that this cache key was called in. When the template changes (e.g., you change a line in your template and then push that change to production), your cache busts and regenerates a new cache value. This is super convenient, otherwise we'd have to expire all of our caches by hand when we changed anything in our templates!

Note here that changing anything in the cache key expires the cache. So if any of the following items change for a given Todo item, the cache will expire and new content will be generated:

* The class of the object (unlikely)
* The object's id (also unlikely, since that's the object's primary key)
* The object's `updated_at` attribute (very likely, because that changes every time the object is saved)
* Our template changes (possible between deploys)

Note that this technique doesn't *actually* expire any cache keys - it just leaves them unused. Instead of manually expiring entries from the cache, we let the cache itself push out unused values when it begins to run out of space. Or, the cache might use a time-based expiration strategy that expires our old entries after a period of time.

You can give an Array to `cache` and your cache key will be based on a concatenated version of everything in the Array. This is useful for different caches that use the same ActiveRecord objects. Maybe there's a todo item view that depends on the current_user:

```
<% todo = Todo.first %>
<% cache([current_user, todo]) do %>
  ... a whole lot of work here ...
<% end %>
```

Now if the current_user gets updated *or* if our todo changes, this cache key will expire and be replaced.

### Russian Doll Caching

Don't be afraid of the fancy name - the DHH-named caching technique isn't very complicated at all.

We all know what Russian dolls look like - one doll contained inside the other. Russian doll caching is just like that - we're going to stack cache fragments inside each other. Let's say we have a list of Todo elements:

```
<% cache('todo_list') do %>
  <ul>
    <% @todos.each do |todo| %>
      <% cache(todo) do %>
        <li class="todo"><%= todo.description %></li>
      <% end %>
    <% end %>
  </ul>
<% end %>
```

But there's a problem with my above example code - let's say I change an existing todo's description from "walk the dog" to "feed the cat". When I reload the page, my todo list will still show "walk the dog" because, although the inner cache has changed, the outer cache (the one that caches the entire todo list) has not! That's not good. We want to re-use the inner fragment caches, but we also want to bust the outer cache at the same time.

Russian doll caching is simply using key-based cache expiration to solve this problem. When the 'inner' cache expires, we also want the outer cache to expire. If the outer cache expires, though, we *don't* want to expire the inner caches. Let's see what that would like in our todo_list example above:

```
<% cache(["todo_list", @todos.map(&:id), @todos.maximum(:updated_at)]) do %>
  <ul>
    <% @todos.each do |todo| %>
      <% cache(todo) do %>
        <li class="todo"><%= todo.description %></li>
      <% end %>
    <% end %>
  </ul>
<% end %>
```

Now, if *any* of the @todos change (which will change @todos.maximum(:updated_at)) or an Todo is deleted or added to @todos (changing @todos.map(&:id)), our outer cache will be busted. However, any Todo items which have not changed will still have the same cache keys in the inner cache, so those cached values will be re-used. Neat, right? That's all there is to it!

In addition, you may have seen the use of the `touch` option on ActiveRecord associations. Calling the `touch` method on an ActiveRecord object updates' the record's `updated_at` value in the database. Using this looks like:

```
class Corporation < ActiveRecord::Base
  has_many :cars
end

class Car < ActiveRecord::Base
  belongs_to :corporation, touch: true
end

class Brake < ActiveRecord::Base
  belongs_to :car, touch: true
end

@brake = Brake.first

# calls the touch method on @brake, @brake.car, and @brake.car.corporation.
# @brake.updated_at, @brake.car.updated_at and @brake.car.corporation.updated_at
# will all be equal.
@brake.touch

# changes updated_at on @brake and saves as usual.
# @brake.car and @brake.car.corporation get "touch"ed just like above.
@brake.save

@brake.car.touch # @brake is not touched. @brake.car.corporation is touched.

```

We can use the above behavior to elegantly expire our Russian Doll caches:

```

<% cache @brake.car.corporation %>
  Corporation: <%= @brake.car.corporation.name %>
  <% cache @brake.car %>
    Car: <%= @brake.car.name %>
    <% cache @brake %>
      Brake system: <%= @brake.name %>
    <% end %>
  <% end %>
<% end %>

```

With this cache structure (and the `touch` relationships configured as above), if we call `@brake.car.save`, our two outer caches will expire (because their `updated_at` values changed) but the inner cache (for `@brake`) will be untouched and reused.

## Which cache backend should I use?

There are a few options available to Rails developers when choosing a cache backend:

* **ActiveSupport::FileStore** This is the default. With this cache store, all values in the cache are stored on the filesystem.
* **ActiveSupport::MemoryStore** This cache store puts all of the cache values in, essentially, a big thread-safe Hash, effectively storing them in RAM.
* **Memcache and dalli** `dalli` is the most popular client for Memcache cache stores. Memcache was developed for LiveJournal in 2003, and is explicitly designed for web applications.
* **Redis and redis-store** `redis-store` is the most popular client for using Redis as a cache.
* **LRURedux** is a memory-based cache store, like ActiveSupport::MemoryStore, but it was explicitly engineered for performance by Sam Saffron, co-founder of Discourse.

Let's dive into each one one-by-one, comparing some of the advantages and disadvantages of each. At the end, I've prepared some performance benchmarks to give you an idea of some of the performance tradeoffs associated with each cache store.

### ActiveSupport::FileStore

FileStore is the default cache implementation for all Rails applications for as far back as I can tell. If you have not explicitly set `config.cache_store` in production.rb (or whatever environment), you are using FileStore.

FileStore simply stores all of your cache in a series of files and folders - in `tmp/cache` by default.

#### Advantages

**FileStore works across processes**. For example, if I have a single Heroku dyne running a Rails app with Unicorn and I have 3 Unicorn workers, each of those 3 Unicorn workers can share the same cache. So if worker 1 calculates and stores my todolist cache from an earlier example, worker 2 can use that cached value. *However*, this does not work across hosts (since, of course, most hosts don't have access to the same filesystem). So, again, on Heroku, while all of the processes on each dyne can share the cache, they cannot share across dynos.

**Disk space is cheaper than RAM**. Hosted Memcache servers aren't cheap. For example, a 30MB Memcache server will run you a few bucks a month. But a 5GB cache? That'll be $290/month, please. Ouch. But disk space is a heckuva lot cheaper than RAM, so if you access to a lot of disk space and have a huge cache, FileStore might work well for that.

#### Disadvantages

**Filesystems are slow(ish)**. Accessing the disk will always be slower than accessing RAM. However, it might be faster than accessing a cache over the network (which we'll get to in a minute).

**Caches can't be shared across hosts**. Unfortunately, you can't share the cache with any Rails server that doesn't also share your filesystem (across Heroku dynes, for example). This makes FileStore inappropriate for large deployments.

**Not an LRU cache**. This is FileStore's biggest flaw. FileStore expires entries from the cache based on the *time they were written to the cache*, not *the last time they were recently used/accessed*. This cripples FileStore when dealing with key-based cache expiration. Recall from our examples above that key-based expiration does not actually expire any cache keys manually. When using this technique with FileStore, the cache will simply grow to maximum size (1GB!) and then start expiring cache entries based on the time they were created. If, for example, your todo list was cached first, but is being accessed 10 times per second, FileStore will still expire that item first! Least-Recently-Used cache algorithms (LRU) work much better for key-based cache expiration because they'll expire the entries that haven't been used in a while *first*.

**Crashes Heroku dynos** Another nail in FileStore's coffin is it's complete inadequacy for the ephemeral filesystem of Heroku. Accessing the filesystem is extremely slow on Heroku for this reason, and actually adds to your dynes' "swap memory". I've seen Rails apps slow to a total crawl due to huge FileStore caches on Heroku that take ages to access. In addition, Heroku restarts all dynes every 24 hours. When that happens, the filesystem is reset, wiping your cache!

#### When should I use ActiveSupport::FileStore?

Reach for FileStore if you have *low request load* (1 or 2 servers) and still need a *very large cache* (>100MB). Also, don't use it on Heroku.

### ActiveSupport::MemoryStore

MemoryStore is the other main implementation provided for us by Rails. Instead of storing cached values on the filesystem, MemoryStore stores them directly in RAM in the form of a big Hash.

ActiveSupport::MemoryStore, like all of the other cache stores on this list, is thread-safe.

#### Advantages

* **It's fast** One of the best-performing caches on my benchmarks (below).
* **It's easy to set up** Simple change `config.cache_store` to `:memory_store`. Tada!

#### Disadvantages

* **Caches can't be shared across processes or hosts** Unfortunately, the cache cannot be shared across hosts (obviously), but it also can't even be shared across processes (for example, Unicorn workers or Puma clustered workers).
* **Caches add to your total RAM usage** Obviously, storing data in memory adds to your RAM usage. This is tough on shared environments like Heroku where memory is highly restrained.

#### When should I use ActiveSupport::MemoryStore?

If you have one or two servers, with a few workers each, and you're storing very small amounts of cached data (<20MB), MemoryStore may be right for you.

### Memcache and dalli

Memcache is probably the most frequently used and recommended external cache store for Rails apps. Memcache was developed for LiveJournal in 2003, and is used in production by sites like Wordpress.org, Wikipedia, and Youtube.

While Memcache benefits from having some absolutely enormous production deployments, it is under a somewhat slower pace of development than other cache stores (because it's so old and well-used, if it ain't broke, don't fix it).

#### Advantages

* **Distributed, so all processes and hosts can share** Unlike FileStore and MemoryStore, *all* processes and dynos/hosts share the exact same instance of the cache. We can maximize the benefit of caching because each cache key is only written once across the entire system.

#### Disadvantages

* **Distributed caches are susceptible to network issues and latency** Of course, it's much, much slower to access a value across the network than it is to access that value in RAM or on the filesystem. Check my benchmarks below for how much of an impact this can have - in some cases, it's extremely substantial.
* **Expensive** Running FileStore or MemoryStore on your own server is free. Usually, you're either going to have to pay to set up your own Memcache instance on AWS or via a service like Memcachier.
* **Cache values are limited to 1MB**. In addition, cache keys are limited to 250 bytes.

#### When should I use Memcache?

If you're running more than 1-2 hosts, you should be using a distributed cache store. However, I think Redis is a slightly better option, for the reasons I'll outline below.

### Redis and redis-store

Redis, like Memcache, is an in-memory, key-value data store. Redis was started in 2009 by Salvatore Sanfilippo, who remains the project lead and sole maintainer today.

In addition to [redis-store](https://github.com/redis-store/redis-store), there's a new Redis cache gem on the block: [readthis](https://github.com/sorentwo/readthis). It's under active development and looks promising.

#### Advantages

* **Distributed, so all processes and hosts can share** Like Memcache, *all* processes and dynos/hosts share the exact same instance of the cache. We can maximize the benefit of caching because each cache key is only written once across the entire system.
* **Allows different eviction policies beyond LRU** Redis allows you to select your own eviction policies, which gives you much more control over what to do when the cache store is full. For a full explanation of how to choose between these policies, check out the [excellent Redis documentation](http://redis.io/topics/lru-cache).
* **Can persist to disk, allowing hot restarts** Redis can write to disk, unlike Memcache. This allows Redis to write the DB to disk, restart, and then come back up after reloading the persisted DB. No more empty caches after restarting your cache store!

#### Disadvantages

* **Distributed caches are susceptible to network issues and latency** Of course, it's much, much slower to access a value across the network than it is to access that value in RAM or on the filesystem. Check my benchmarks below for how much of an impact this can have - in some cases, it's extremely substantial.
* **Expensive** Running FileStore or MemoryStore on your own server is free. Usually, you're either going to have to pay to set up your own Redis instance on AWS or via a service like Redis.
* **While Redis supports several data types, redis-store only supports Strings** This is a failure of the `redis-store` gem rather than Redis itself. Redis supports several data types, like Lists, Sets, and Hashes. Memcache, by comparison, only can store Strings. It would be very interesting to be able to use the additional data types provided by Redis (which could cut down on a lot of marshaling/serialization).

#### When should I use Redis?

If you're running more than 2 servers or processes, I recommend using Redis as your cache store.

### LRURedux

Developed by Sam Saffron of Discourse, LRURedux is essentially a highly optimized version of ActiveSupport::MemoryStore. Unfortunately, it does not yet provide an ActiveSupport-compatible interface, so you're stuck with using it on a low-level in your app, not as the default Rails cache store for now.

#### Advantages

* **Ridiculously fast** LRURedux is by far the best-performing cache in my benchmarks.

#### Disadvantages

* **Caches can't be shared across processes or hosts** Unfortunately, the cache cannot be shared across hosts (obviously), but it also can't even be shared across processes (for example, Unicorn workers or Puma clustered workers).
* **Caches add to your total RAM usage** Obviously, storing data in memory adds to your RAM usage. This is tough on shared environments like Heroku where memory is highly restrained.
* **Can't use it as a Rails cache store** Yet.

#### When should I use LRURedux?

Use LRURedux where algorithms require a performant (and large enough to the point where a Hash could grow too large) cache to function.

## Cache Benchmarks

Who doesn't love a good benchmark? [All of the benchmark code is available here on GitHub](https://gist.github.com/nateberkopec/14d6a2fb7fe5da06a1f6).

### Fetch

The most often-used method of all Rails cache stores is `fetch` - if this value exists in the cache, read the value. Otherwise, we write the value by executing the given block. Benchmarking this method tests both read and write performance. `i/s` stands for "iterations/second".

```
LruRedux::ThreadSafeCache:   337353.5 i/s
ActiveSupport::Cache::MemoryStore:    52808.1 i/s - 6.39x slower
ActiveSupport::Cache::FileStore:    12341.5 i/s - 27.33x slower
ActiveSupport::Cache::DalliStore:     6629.1 i/s - 50.89x slower
ActiveSupport::Cache::RedisStore:     6304.6 i/s - 53.51x slower
ActiveSupport::Cache::DalliStore at pub-memcache-13640.us-east-1-1.2.ec2.garantiadata.com:13640:       26.9 i/s - 12545.27x slower
ActiveSupport::Cache::RedisStore at pub-redis-11469.us-east-1-4.2.ec2.garantiadata.com:       25.8 i/s - 13062.87x slower
```

Wow - so here's what we can learn from those results:

* LRURedux, MemoryStore, and FileStore are so fast as to be basically instantaneous.
* Memcache and Redis are still very fast when the cache is on the same host.
* When using a host far away across the network, Memcache and Redis suffer significantly, taking about ~50ms per cache read (under extremely heavy load). This means two things - when choosing a Memcache or Redis host, choose the one closest to where your servers are and benchmark its performance. Second, don't cache anything that takes less than ~10-20ms to generate by itself.

### Full-stack in a Rails app

For this test, we're going to try caching some content on a webpage in a Rails app. This should give us an idea of how much time read/writing a cache fragment takes when we have to go through the entire request cycle as well.

Essentially, all the app does is set `@cache_key` to a random number between 1 and 16, and then render the following view:

```
<% cache(@cache_key) do %>
  <p><%= SecureRandom.base64(100_000) %></p>
<% end %>
```

#### Average response time in ms - less is better

The below results were obtained with Apache Bench. The result is the average of 10,000 requests made to a local Rails server in production mode.

* Redis/redis-store (remote)      47.763
* Memcache/Dalli (remote)         43.594
* With caching disabled             10.664
* Memcache/Dalli   (localhost)         5.980
* Redis/redis-store (localhost)    5.004
* ActiveSupport::FileStore           4.952
* ActiveSupport::MemoryStore       4.648

Some interesting results here, for sure! Note that the difference between the fastest cache store (MemoryStore) and the uncached version is about 6 milliseconds. We can infer, then, that the amount of work being done by ```SecureRandom.base64(100_000)``` takes about 6 milliseconds. Accessing the remote cache, in this case, is actually slower than just doing the work!

The lesson? **When using a remote, distributed cache, figure out how long it actually takes to read from the cache**. You can find this out via benchmarking, like I did, or you can even read it from your Rails logs. Make sure you're not caching anything that takes longer to read than it does to write!

## Conclusions

Hopefully, this article has given you all you need to know to get out there and use caching more in your Rails apps. It really is the key to extremely performant Rails sites.
