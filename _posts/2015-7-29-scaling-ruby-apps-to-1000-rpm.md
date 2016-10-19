---
layout: post
title:  "Scaling Ruby Apps to 1000 Requests per Minute - A Beginner's Guide"
date:   2015-07-29 11:00:00
summary: Most "scaling" resources for Ruby apps are written by companies with hundreds of requests per second. What about scaling for the rest of us?
readtime: 5289 words/26 minutes
---

Scaling is an intimidating topic. Most blog posts and internet resources around scaling Ruby apps are about scaling Ruby to *tens of thousands of requests per minute*. That's Twitter and Shopify scale. These are interesting - it's good to know the ceiling, how much Ruby can achieve - but not very useful for the majority of us out there that have apps bigger than 1 server but less than 100 servers. Where's the "beginner's guide" to scaling? {% sidenote 1 "I think the problem is that most people aren't comfortable writing about how big they are until they're <i>huge</i>." %}

Thus, most scaling resources for Ruby application developers are completely inappropriate for their needs. The techniques Twitter used to scale from 10 requests/second to 600 requests/second {% marginnote_lazy https://i.imgur.com/x1MVcq7.gif|Me, after reading how a 1000 req/sec app scaled and my app only gets 10 requests/minute|true" %} are not going to be appropriate for getting your app from 10 requests/minute to 1000 requests/minute. Mega-scale has its own unique set of problems - database I/O especially becomes an issue, as your app tends to scale horizontally (across processes and machines) while your database scales vertically (adding CPU and RAM). All of this combines to make scaling a tough topic for most Rails application developers. When do I scale up? When do I scale down?

Since I'm limiting this discussion to 1000 rpm or less, here's what I won't discuss: scaling the DB or other datastores like Memcache or Redis, using a high-performance message queue like RabbitMQ or Kafka, or distributing objects. Also, I'm not going to *tell* you how to get faster response times in this post, although doing so will help you scale.

Also, I won't cover devops or anything beyond your application server (Unicorn, Puma, etc.) First, although it seems shocking to admit, I've spent my entire professional career deploying applications to the Heroku platform.{% sidenote 2 "I work for small startups with less than 1000 requests/minute scale. Most of the time, you're the sole developer or one of a handful. For small teams at small scales like this, I think Heroku's payoff is immense. Yes, you can pay perhaps even 50% more on your server bill, but the developer hours it saves screwing with Chef/Ansible/Docker/DevOps Flavor Of The Week pays off big time." %} I just don't have the experiences to share on scaling custom setups (Docker, Chef, what-have-you) on non-Heroku platforms. Second, when you're running less than 1000 requests/minute, your devops workflow doesn't really need to be specialized all that much. All of the material in this post should apply to all Ruby apps, regardless of devops setup.

As a consultant, I've gotten to see quite a few Rails applications. And most of them are *over-scaled* and *wasting money*.

Heroku’s dyno sliders and the many services of AWS make scaling simple, but they also make it easy to scale even when you don’t need to. Many Rails developers think that scaling dynos or upping their instance size will make their application faster {% sidenote 3 "Yes, scaling dynos on Heroku will NEVER make your application faster *unless* your app has requests queued and waiting most of the time (explained below). Even PX dynos will only make performance more *consistent*, not *faster*. Changing instance *types* on AWS though (for example, T2 to M4) may change performance characteristics of app instances." %}. When they see that their application is slow, their first reflex is to scale dynos or up their instance sizes (indeed - Heroku support will usually encourage them to do just this! Spend more money, that will solve the problem!).  Most of the time though, it doesn't help their problem. Their site is still slow.

As a glossary for this post: *host* refers to a single host machine, virtualized or physical. On Heroku, this is a Dyno. Sometimes people will call this a *server*, but for this post, I want to differentiate between your *host machine* and the *application server* that runs on that machine. A single *host* may run many *app servers*, like Unicorn or Puma. On Heroku, a single host runs a single app server. An *app server* has many *app instances*, which may be separate "worker" processes (like Unicorn) or threads (Puma when running on JRuby in multithreaded). For the purposes of this post, a multi-threaded web server with a single app instance on MRI (like Puma) is not an *app instance* because threads cannot be executed at the same time. Thus, a typical Heroku setup might have 1 host/dyno, with 1 app server (1 Puma master process) with 3-4 app instances (Puma clustered workers).

**Scaling increases throughput, not speed**. Scaling hosts only speeds up response times if requests are spending time waiting to be served by your application. If there are no requests waiting to be served, scaling only wastes money.

In order to learn about how to scale Ruby apps correctly from 1 to 1000 requests/minute, we're going to need to learn a considerable amount about how your application server and HTTP routing actually works.

**I'm going to use Heroku as an example, but many custom devops setups work quite similarly.** Ever wondered exactly what the "routing mesh" was or where requests get queued before being routed to your server? Well, you're about to find out.

## How requests get routed to app servers

One of the most important decisions you can make when scaling a Ruby web application is what application server you choose. Most Ruby scaling posts are thus out of date, because the Ruby application server world has changed dramatically in the last 5 years, and most of that whirlwind of change has happened only in the last year. However, to understand the advantages and disadvantages of each application server choice, we're going to have to learn how requests even get routed to your application server in the first place.

Understandably, a lot of developers don't understand how, exactly, requests are routed and queued. It isn't simple. Here's the gist of what most Rails devs already understand about Heroku does it {% marginnote_lazy https://i.imgur.com/zy0XzzZ.gif|So the router load balances the Unicorns? Or the Pumas?|true" %}:

* "I think routing changed between Bamboo and Cedar stacks."
* "Didn't RapGenius got pretty screwed over back in the day? I think it was because request queueing was being incorrectly reported."
* "I should use Unicorn. Or, wait, I guess Heroku says I should use Puma now. I don't know why."
* "There's a request queue somewhere. I don't really know where."

Heroku's documentation on HTTP routing is a good start, but it doesn't quite explain the whole picture. For example, it's not immediately obvious *why* Heroku recommends Unicorn or Puma as your application server. It also doesn't really lay out where, exactly, requests get "queued" and which queues are the most important. So let's follow a request from start to finish!

### The life of a request

{% marginnote_lazy https://i.imgur.com/aawbrN5.png %}When a request comes in to yourapp.herokuapp.com, the first place it stops is a load balancer. These load balancers' job is to make sure the load between Heroku's routers is evenly distributed - so they don't do much other than decide to which router the request should go. The load balancer passes off your request to whichever router it thinks is best (Heroku hasn't publicly discussed how their load balancers work or how the load balancers make this decision).

Now we're at the Heroku router. There are an undisclosed number of Heroku routers, but we can safely assume that the number is pretty large (100+?). The router's job is to *find your application's dynos* and *pass on the request to a dyno*. So after spending about 1-5ms locating your dynos, the router will attempt to connect to a *random dyno* in your app. Yes, a random one. This is where RapGenius got tripped up a few years ago (back then, Heroku was at best unclear and at worst misleading about how the router chose which dyno to route to). Once Heroku has chosen a random dyno, it will then wait *up to five seconds* for that dyno to accept the request and open a connection. While this request is waiting, it is placed in the router's request queue. However, *each router* has *its own* request queue, and since Heroku hasn't told us how many routers it has, there could be a *huge* number of router queues at any given time for your application. Heroku *will* start throwing away requests from the request queue if it gets too large, and it will also try to quarantine dynos that are not responding (but again, it only does this on an individual router basis, so *every router* on Heroku has to individually quarantine bad dynos). {% sidenote 4 "All of this is *basically* how most custom setups utilize nginx. <a href='https://www.digitalocean.com/community/tutorials/how-to-scale-ruby-on-rails-applications-across-multiple-droplets-part-1'>See this DigitalOcean tutorial</a>. Sometimes nginx plays the role of both load balancer and reverse-proxy in these setups. All of this behavior can be duplicated using custom nginx setups, though you may want to choose more aggressive settings. Nginx can actually actively send health-check requests to upstream application servers to check if they're alive. Custom nginx setups tend not to have their own request queues, however." %}

There are two critical details here for Heroku users: the router will *wait up to 5 seconds for a successful connection to your dyno* and *while it's waiting, other requests will wait in the router request queue*.

### Connecting to your server - the importance of server choice

The router {% sidenote 5 "Custom setup people - when I say router, you say 'nginx' or 'Apache'." %} attempting to connect to the server is *the most critical* stage for you to understand, and what happens differs *greatly* depending on your choice of web server. Here's what happens next, depending on your server choice:

#### **Webrick (Rails default)**

Webrick is a single-thread, single-process web server.

It will keep the router's connection open until it has downloaded the entirety of the request from the router. The router will then move on to the next request. Your Webrick server will then take the request, run your application code, and then send back the response to the router. During all of this time, your host is busy and will not accept connections from other routers. If a router attempts to connect to this host while the request is being processed, the router will wait (up to 5 seconds, on Heroku) until the host is ready. The router will not attempt to open other connections to other dynos while it waits. The problems with Webrick are exaggerated with slow requests and uploads.

If someone is trying to upload a 4K HD video of their cat over a 56k modem, you're out of luck - Webrick is going to sit there and wait while that request downloads, and will not do anything in the meantime. Got a mobile user on a 3G phone? Too bad - Webrick is going to sit there and not accept any other requests while it waits for that user's request to slowly and painfully complete.

Webrick can't deal well with slow client requests or slow application responses.

#### **Thin**

Thin is an event-driven, single-process web server. {% sidenote 7 "There's a way to run multiple Thins on a single host - however, they must all listen on different sockets, rather than a single socket like Unicorn. This makes the setup Heroku-incompatible." %}

Thin uses EventMachine under the hood (this process is sometimes called *Evented I/O*. It works not unlike Node.js.), which gives you several benefits, in theory. Thin opens a connection with the router and starts accepting parts of the request. Here's the catch though - if suddenly that request slows down or data stops coming in through the socket, Thin will go off and do something else. This provides Thin some protection from *slow clients*, because no matter how slow a client is, Thin can go off and receive other connections from other routers in the meantime. Only when a request is fully downloaded will Thin pass on your request to your application. In fact, Thin will even write very large requests (like uploads) to a temporary file on the disk.

Thin is multi-threaded, not multi-process, and threads only run one at a time on MRI. So while actually running your application, your host becomes unavailable (with all the negative consequences outlined under the Webrick section above). Unless you get very fancy with your use of EventMachine, too, Thin cannot accept other requests while waiting for I/O in the application code to finish. For example - if your application code POSTs to a payments service for credit card authorization, Thin cannot accept new requests while waiting for that I/O operation to complete *by default*. Essentially you'd need to modify your application code to send *events* back to Thin's EventMachine reactor loop to tell Thin "Hey, I'm waiting for I/O, go do something else". [Here's more about how that works.](http://www.bigfastblog.com/rubys-eventmachine-part-3-thin)

Thin can deal with slow client requests, but it can't deal with slow application responses or application I/O without a whole lot of custom coding.

#### Unicorn

Unicorn is a single-threaded, multi-process web server.

Unicorn spawns up a number of "worker processes" (app instances), and those processes all sit and listen on a single Unix socket, coordinated by the "master process". When a connection request comes in from a host, it does *not* go to the master process, but instead directly to the Unicorn socket where all of the worker processes are waiting and listening. This is Unicorn's special sauce - no other Ruby web servers (that I know of) use a Unix domain socket as a sort of "worker pool" with no "master process" interference. A worker process (which is only listening on the socket because it isn't processing a request) accepts the request from the socket. It waits on the socket until the request is fully downloaded (setting off alarm bells yet?) and then stops listening on the socket to go process the request. After it's done processing the request and sending a response, it listens on the socket again.

Unicorn is vulnerable to slow clients {% sidenote 8 "You can use nginx in a custom setup to buffer requests to Unicorn, eliminating the slow-client issue. This is exactly what Passenger does, below." %} in the same way Webrick is - while downloading the request off the socket, Unicorn workers cannot accept any new connections, and that worker becomes unavailable. Essentially, you can only serve as many slow requests as you have Unicorn workers. If you have 3 Unicorn workers and 4 slow requests that take 1000ms to download, the fourth request will have to sit and wait while the other requests are processed. This method is sometimes called *multi-process blocking I/O*. In this way, Unicorn can deal with slow application responses (because free workers can still accept connections while another worker process is off working) but not (very many) slow client requests. Notice that Unicorn's socket-based model is a form of *intelligent routing*, because only available  application instances will accept requests from the socket.

#### Phusion Passenger 5

Passenger uses a hybrid model of I/O - it uses a multi-process, worker-based structure like Unicorn, however it also includes a buffering reverse proxy.

This is important - it's a bit like running nginx in front of your application's workers. In addition, if you pay for Passenger Enterprise, you can run multiple app threads on each worker (like Puma, below). To see why Phusion Passenger 5's built-in reverse proxy (a customized nginx instance written in C++, *not* Ruby) is important, let's walk through a request to Passenger. Instead of a socket, Heroku's router connects to `nginx` directly and passes off a request to it. This `nginx` is a specially optimized build, with a whole lot of fancy techniques that make it extremely efficient at serving Ruby web applications. It will download the *entire request* before forwarding it on to the next step - protecting your workers from slow uploads and other slow clients.

Once it has completed downloading the request, `nginx` forwards the request on to a HelperAgent process, which determines which worker process should handle the request. Passenger 5 can deal with slow application responses (because its HelperAgent will route requests to unused worker processes) *and* slow clients (because it runs its own instance of `nginx`, which will buffer them).

#### Puma (threaded only)

Puma, in its default mode of operation, is a multi-threaded, single-process server.

When an application connects to your host, it connects to an EventMachine-like Reactor thread, which takes care of downloading the request, and can asynchronously wait for slow clients to send their entire request (again, just like Thin). When the request is downloaded, the Reactor *spawns a new Thread* that communicates with your application code, and that thread processes your request. You can specify the maximum number of application Threads running at any given time. Again, in this configuration, Puma is multi-threaded, not multi-process, and threads only run one at a time on MRI Ruby. What's special about  Puma, however, is that unlike Thin, you don't have to modify your application code to gain the benefits of threading. Puma automatically yields control back to the process when an application thread waits on I/O. If, for example, your application is waiting for an HTTP response from a payments provider, Puma can still accept requests in the Reactor thread or even complete other requests in different application threads. So while Puma can deliver a big performance increase while waiting on I/O operations (like databases and network requests) while actually running your application, your host becomes unavailable during processing, with all the negative consequences outlined under the Webrick section above. Puma (in threaded-only mode) can deal with slow client requests, but it can't deal with slow, CPU-bound application responses.

#### Puma (clustered)

Puma has a "clustered" mode, where it combines its multi-threaded model with Unicorn's multi-process model.

In clustered mode, Heroku's routers connect to Puma's "master process", which is essentially just the Reactor part of the Puma example above. The master process' Reactor downloads and buffers incoming requests, then passes them to any available Puma worker sitting on a Unix socket (similar to Unicorn). In clustered mode, then, Puma can deal with slow requests (thanks to a separate master process whose responsibility it is to download requests and pass them on) and slow application responses (thanks to spawning multiple workers).

### But what does it all mean?

So, if you've been paying attention so far, you've realized that a scalable Ruby web application needs **slow client protection** in the form of request buffering, and **slow response protection** in the form of some kind of concurrency - either multithreading or multiprocess/forking (preferably both). That only leaves **Puma in clustered mode** and **Phusion Passenger 5** as scalable solutions for Ruby applications on Heroku running MRI/C Ruby. If you're running your own setup, Unicorn with nginx becomes a viable option.

Each of these web servers make varying claims about their "speed" - I wouldn't get too caught up on it. All of these web servers can handle 1000s of requests per minute, meaning that it takes them less than 1ms to actually handle a request. If Puma is 0.001ms faster than Unicorn, then that's great, but it really doesn't help you very much if your Rails application takes 100ms on average to turn around a request. The biggest difference between Ruby application servers is not their speed, but their varying I/O models and characteristics. As I've discussed above, I think that Puma in clustered mode and Phusion Passenger 5 are really the only serious choices for scaling Ruby application because their I/O models deal well with slow clients and slow applications. They have many other differences in features, and Phusion offers enterprise support for Passenger, so to really know which one is right for you, you'll have to do a full feature comparison for yourself.

### "Queue time" - what does it mean?

As we've seen through the above explanation, there isn't really a single "request queue". In fact, your application may be interacting with hundreds of "request queues". Here are all the places a request might "queue":

* At the load balancer, Unlikely, as load balancers are tuned to be very fast. (~10 load balancer queues?)
* At any of the 100+ Heroku routers. Remember that each router queue is separate (100+ router queues).
* If using a multiprocess server like Unicorn, Puma or Phusion Passenger, queueing at the "master process" or otherwise inside the host (1 queue per host).

So how in the heck does New Relic know how to report queue times?

Well, this is how RapGenius got burned.

In 2013, RapGenius got burned hard when they discovered that Heroku's "intelligent routing" was not intelligent at all - in fact, it was completely random. Essentially, when Heroku was transitioning from Bamboo to Cedar stacks, they *also* changed the load balancer/router infrastructure for *everyone* - Bamboo and Cedar stacks both! So Bamboo stack apps, like RapGenius, were suddenly getting random routing instead of intelligent routing {% sidenote 9 "By intelligent routing, we just mean something better than random. Usually intelligent routing involves actively pinging the upstream application servers to see if they're available to accept a new request. This decreases wait time at the router." %}

Even worse, Heroku's infrastructure *still reported stats* as if it had intelligent routing (with a *single* request queue, not one-queue-per-router). Heroku would report queue time back to New Relic (in the form of a HTTP header), which New Relic displayed as the "total queue time". However, that header was only reporting the time that particular request spent *in the router queue*, which, if there are 100s of routers, could be extremely low, regardless of load at the host! {% sidenote 10 "Imagine - Heroku connects to Unicorn's master socket, and passes a request onto the socket. Now that request spends 500ms on the socket waiting for an application worker to pick it up. Previously, that 500ms would be unnoticed because only router queue time was reported." %}

Nowadays, New Relic reports queue times based on an HTTP header reported by Heroku called `REQUEST_START`. This header marks the time when Heroku accepted the request at the load balancer. New Relic just subtracts the time that your application worker started processing the request from `REQUEST_START` to get the queue time. So if `REQUEST_START` is exactly 12:00:00 PM, and your application doesn't start processing the request until 12:00:00.010, New Relic reports that as 10ms of queue time. What's nice about this is that it takes into account the time spent at all levels: time at the load balancer, time at the Heroku routers, and time spent queueing on your host (whether in Puma's master process, Unicorn's worker socket, or otherwise).{% sidenote 11 "Of course, by setting the correct headers on your own nginx/apache instance, you can get accurate request queueing times with your custom setup." %}

## When do I scale app instances?

**Don’t scale your application based on response times alone.** Your application may be slowing down due to increased time in the request queue, or it may not. If your request queue is empty and you’re scaling hosts, you’re just wasting money. Check the time spent in the request queue before scaling.

The same applies to worker hosts. Scale them based on the depth of your job queue. If there aren’t any jobs waiting to be processed, scaling your worker hosts is pointless. In effect, your worker dynos and web dynos are exactly the same - they both have incoming jobs (requests) that they need to process, and should be scaled based on the number of jobs that are waiting for processing.

NewRelic provides time spent in the request queue, although there are gems that will help you to measure it yourself. If you’re not spending a lot of time (>5-10ms of your average server response time) in the request queue, the benefits to scaling are extremely marginal.

### Dyno counts must obey Little’s Law.

I usually see applications over-scaled when a developer doesn't understand how many requests their server can process per second. They don't have a sense of "how many requests/minute equals how many dynos?"

I already explained a practical way to determine this - measuring and responding to changes in request queueing time. But there's also a theoretical tool we can use - [Little’s Law](https://en.wikipedia.org/wiki/Little%27s_law). The Wikipedia explanation is a bit obtuse, so here’s my formulation, adapted slightly:

![Minimum application instances required = average web request arrival rate (req/sec) * average response time (in seconds)](https://i.imgur.com/ch59HBx.png)

First off, some definitions - as mentioned above, the application instance is the atomic unit of your setup. Its job is to process a single request independently and send it back to the client. When using Webrick, your application instance is the entire Webrick process. When using Puma in threaded mode, I will define the *entire Puma process* as your application instance when using MRI, and when using JRuby, *each thread* counts as an application instance. When using Unicorn, Puma (clustered) or Passenger, your application instance is *each "worker" process*. {% sidenote 10 "Really, a multithreaded Puma process on MRI should count as 1.5 app instances, since it can do work while waiting on I/O. For simplicity, let's say it is one." %}

Let’s do the math for a typical Rails app, with the prototypical setup - Unicorn. Let's say each Unicorn process forks 3 Unicorn workers. So our single-server app actually has 3 application instances. If this app is getting 1 request per second, and its average server response time is 300ms, it only needs 1 * 0.3 = 0.3 app instances to service its load. So we're only using 10% of our available server capacity here! What's our application's theoretical maximum capacity? Just change the unknowns:

![Theoretical maximum throughput = App Instances / Average Response Time](https://i.imgur.com/6jetB5M.gif)

So for our example app, our theoretical maximum throughput is 3 / 0.3, or 10 requests per second! That's pretty impressive.

But theory is never reality. Unfortunately, Little's Law is only true *in the long run*, meaning that things like a wide, varying distribution of server response times (some requests take 0.1 seconds to process, others 1 second) or a wide distribution of arrival times can make the equation inaccurate. But it's a good "rule of thumb" to think about whether or not you might be over-scaled. {% sidenote 11 "In addition, think about what these caveats mean for scaling. You can only maximize your actual throughput if requests are as close to the median as possible. An app with a predictable response time is a scalable app. In fact, you may obtain more accurate results from Little's Law if, instead of using *average* server response time, you use your *95th percentile* response time. You're only as good as your slowest responses if your server response times are variable and unpredictable. How do you decrease 95th percentile response times? Aggressively push work into background processes, like Sidekiq or DelayedJob." %}

Recall again that scaling hosts doesn’t directly increase server response times, it can only increase the number of servers available to work on our request queue. If the average number of requests waiting in the queue is less than 1, our servers are not working at 100% capacity and the benefits to scaling hosts are marginal (i.e., not 100%). The maximum benefit is obtained when there is always at least 1 request in the queue. There are probably good reasons to scale *before* that point is reached, especially if you have slow server response times. But you should be aware of the rapidly decreasing marginal returns.

So when setting your host counts, try doing the math with Little’s Law. If you’re scaling hosts when, according to Little’s Law, you're only at 25% or less of your maximum capacity, then you might be scaling prematurely. Alternatively, as mentioned above, spending a large amount of time per-request in the request queue as measured on NewRelic is a good indication that it’s time to scale hosts.

#### Checking the math

In [April 2007, a presentation was given at SDForum Silicon Valley](http://www.slideshare.net/Blaine/scaling-twitter) by a Twitter engineer on how they were scaling Twitter. At the time, Twitter was still fully a Rails app. In that presentation, the engineer gave the following numbers:

* 600 requests/second
* 180 application instances (mongrel)
* About 300ms average server response time

So Twitter's theoretical instances required, in 2007, was 600 * 0.3, or 180! And it appeared that's what they were running. Twitter running at 100% maximum utilization seems like a recipe for disaster - and Twitter did have a lot of scaling issues at the time. It may have been that they were unable to scale to more application instances because they were still stuck with a single database server (yup) and had bottlenecks elsewhere in the system that wouldn't be solved by more instances.

As a more recent example, in 2013 at Big Ruby Shopify engineer John Duff gave a presentation on [How Shopify Scales Rails](http://www.slideshare.net/jduff/how-shopify-scales-rails-20443485) ([YouTube](https://www.youtube.com/watch?v=j347oSSuNHA)). In that presentation{% sidenote 12 "[Shopify's Scaling Rails presentation presents a form of Little's Law](https://www.youtube.com/watch?v=j347oSSuNHA#t=7m44s)."%}, he claimed:

* Shopify receives 833 requests/second.
* They average a 72ms response time
* They run 53 application servers with a total of 1172 application instances (!!!) with Nginx and Unicorn.

So, Shopify's theoretical required instance count is 833 * 0.072 just ~60 application instances. So why are they using 1172 and wasting (theoretically) 95% of their capacity? If application instances block each other in *any way*, like when reading data off a socket to receive a request, Little's Law will fail to hold. This is why I don't count Puma threads as an application instance on MRI. Another cause can be CPU or memory utilization - if an application server is maxing out its CPU or memory, its workers cannot all work at full capacity. This blocking of application instances (anything that stops all 1172 application instances from operating at the same time) can cause major deviations from Little's Law.{% sidenote 13 "[There is a distributional form of Little's Law](http://web.mit.edu/dbertsim/www/papers/Queuing%20Theory/The%20distributional%20Little's%20law%20and%20its%20applications.pdf) that can help with some of these inaccuracies, but unless you're a math PhD, it's probably out of your reach." %}

Finally, [Envato posted in 2013 about how Rails scales for them](http://webuild.envato.com/blog/rails-still-scaling-at-envato/). Here's some numbers from them:

* Envato receives 115 requests per second
* They run an average of 147ms response time
* [They run 45 app instances](http://www.slideshare.net/johnpviner/bank-west-10-deploys-a-day-at-envato-published).

So the math is 115 * 0.147, which means Envato theoretically requires ~17 app instances to serve their load. They're running at 37% of their theoretical maximum, which is a good ratio.

## The Checklist: 5 Steps to Scaling Ruby Apps to 1000 RPM

Hopefully this post has given you the tools you need to scale to 1000 requests-per-minute. As a reminder, here's what you need to remember:

* Choose a multi-process web server with slow client protection and smart routing/pooling. Currently, your only choices are Puma (in clustered mode), Unicorn with an nginx frontend, or Phusion Passenger 5.
* Scaling dynos increases throughput, not application speed. If your app is slow, scaling should not be your first reflex.
* Host/dyno counts must obey Little's Law.
* Queue times are important - if queue times are low (<10ms), scaling hosts is pointless.
* Realize you have three levers - increasing application instances, decreasing response times, and decreasing response time variability. A scalable application that requires fewer instances will have fast response times and low response time variability.
