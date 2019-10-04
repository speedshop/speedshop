---
layout: post
title:  "A New Ruby Application Server: NGINX Unit"
date:   2018-03-28 7:00:00
summary: "NGINX Inc. has just released Ruby support for their new multi-language application server, NGINX Unit. What does this mean for Ruby web applications? Should you be paying attention to NGINX Unit?"
readtime: 2057 words/10 minutes
wordcount: 2057
image: nginxunit-share.jpg
---

There's a new application server on the block for Rubyists - NGINX Unit. As you could probably guess by the name, it's a project of [NGINX Inc.](https://www.nginx.com/company/), the for-profit open-source company that owns the NGINX web server. In fall of 2017, they announced the [NGINX Unit](https://unit.nginx.org/) project. It's essentially an application server designed to replace all of the various application servers used with NGINX. In Ruby's case, that's Puma, Unicorn, and Passenger.{% sidenote 1 "For a far more in-depth comparison of these application servers, read [my article about configuring Puma, Passenger and Unicorn](/2017/10/12/appserver.html)" %} NGINX Unit also runs Python, Go, PHP and Perl.

The overarching idea seems to be to make microservice administration a lot easier. One NGINX Unit process can run any number of applications running any number of languages - for example, one NGINX Unit server can manage a half-dozen different Ruby applications, each running a different version of the Ruby runtime. Or you can run a Ruby application and a Python application side-by-side. The combinations are only limited by your system resources.

{% marginnote_lazy bullshit-meter.gif||true %}

Unfortunately, the "microservice" space is quite prone to buzzword-laden marketing pages.{% sidenote 2 "I really don't like when software projects advertise themselves as \"modern\". It's like \"subtweeting\" all pre-existing software projects in this problem space and saying they're all old and busted, and this is the New Way To Do Things. Why it's better than the \"old busted ways\" is never explicitly stated. This kind of marketing preys on software developer's fear of becoming obsolete in their skillset, rather than making any substantive point." %} Words like "dynamic", "modular", "lightweight" are mixed in with "service mesh", "seamless" and "graceful". This article is going to be about cutting through the marketing and getting into what NGINX Unit means for those of us running production Ruby applications.

Before I move on to more about NGINX Unit's architecture and what makes it unique, let's make sure we all understand the difference between an application server and a web server. A **web server** connects to clients over HTTP, and usually serves static files or **proxies** to other HTTP-enabled servers, and acts as a middleman. An **application server** is the thing which actually starts and runs the language runtime. In Ruby, these functions are sometimes combined. For example, all of the major Ruby application servers *also* are web servers. However, many web servers, such as Nginx and Apache, are *not* also application servers. Nginx UNIT is both a web *and* application server.

{% marginnote_lazy nginx-unit.png||false %}

NGINX Unit runs four different types of processes: main, router, controller, and application. Application processes are the self-explanatory ones - this would just be the Ruby runtime running your Rails application. The router and controller processes, and how they interact with each other and the application processes, is what defines how NGINX Unit works.

The main process creates the router and application processes. That's really all it does. Application processes in NGINX Unit are dynamic, however - the number of processes running can be changed at any time, Ruby versions can be changed, or even entire new applications can be added while the server is running. The thing that tells the main process what application processes to run is the controller process.

The controller process (like the main process, there's only one) has two jobs: expose a JSON configuration API over HTTP, and configure the router and main processes. This is probably the most novel and interesting part of NGINX Unit for Rubyists. Rather than working with configuration files, you POST JSON objects to the controller process to tell it what to do. For example, with this json file:

```
{
    "listeners": {
        "*:3000": {
            "application": "rails"
        }
    },

    "applications": {
        "rails": {
            "type": "ruby",
            "processes": 5,
            "script": "/www/railsapp/config.ru"
        }
    }
}
```

... we can PUT it to an NGINX Unit controller process with this (assuming our NGINX Unit server is listening on port 8443):

```
curl -d "myappconfig.json" -X PUT '127.0.0.1:8443'
```

... and create a new Ruby application.

NGINX Unit's JSON configuration object is divided into *listeners* and *applications*. Applications are the actual apps you want to run. Listeners are where those apps are exposed to the world (i.e. what port they're on).

Changes in application and listener configuration are supposed to be seamless. For example, a "hot deploy" of a new version of your application would be accomplished by adding a new application to the configuration:

```
{
  "rails-new": {
      "type": "ruby",
      "processes": 5,
      "script": "/www/rails-new-app/config.ru"
  }
}

curl -d "mynewappconfig.json" -X PUT
```

and then switching the listener to the new application:

```
curl -X PUT -d '"rails-new"' '127.0.0.1:8443/listeners/*:3000/application`
```

This transition is (supposedly) seamless, and clients won't notice. This is similar to a Puma "phased restart". In a phased restart in Puma, each worker process is restarted one at a time, which means that the other works processes are up and available to take requests. Puma accomplishes this using a control server (managed by the `pumactl` utility). However, unlike Puma, NGINX Unit "hot restarts" will not have two versions of the application taking requests at the same time.

In a [Puma phased restart](https://github.com/puma/puma/blob/master/docs/restart.md), say your application has six workers. Halfway through the phased restart, 3 works will be running the old code, and half will be running new code. This can cause some problems with database schema changes, for example. NGINX Unit restarts happen "all at once", so while two versions of the code will be running at once, only one version will be taking requests at any point in time.

This functionality seems quite useful to those who are running their own Ruby applications on a service such as AWS, where you have to manage your own deployment. However, Heroku users won't find any of this useful, as you've already had this sort of "hot deploy" functionality using [Heroku's preboot system](https://devcenter.heroku.com/articles/preboot). However, these two features aren't doing exactly the same thing. Heroku creates an entirely new virtual server and hot-swaps the whole thing, whereas NGINX Unit is just changing processes on a single machine, but they're completely the same from a client perspective.

{% marginnote_lazy nginx-unit-router.png||false %}

The router process is pretty much what it sounds like - the thing which turns HTTP connections from clients into requests to the web application processes. NGINX claims a single Unit router can handle thousands of simultaneous connections. The router works a lot like an NGINX web server, and has a number of worker threads to accept, buffer and parse incoming connections.

To me, this is one of the most exciting parts of NGINX Unit for Rubyists. It is very difficult for Ruby application servers to deal with HTTP connections without some kind of reverse proxy in front of the app server. Unicorn, for example, is recommended for use only behind a reverse proxy because it cannot buffer requests. That is, if a client sends one byte of their request and then stops (due to network conditions, a bad cellphone connection perhaps), then the Unicorn process just stops all work and cannot continue until that request has finished buffering. Using NGINX, for example, in front of Unicorn allows NGINX to buffer that request before it reaches Unicorn. Since NGINX is written in highly optimized C and it's *not*  restricted by Ruby's GVL, it can buffer hundreds of connections for Unicorn. Passenger solves this problem by basically just being an addon for NGINX or Apache{% sidenote 3 "Now you know why it's called *Passenger*!" %} (`mod_ruby`!) and offloading all of the connection-related work to the webserver. In this way, NGINX Unit is more similar to Passenger than it is to Unicorn.

The application configuration has a `processes` key. This key can have a minimum number and maximum number of processes:

```
{
  "rails-new": {
      "type": "ruby",
      "processes": {
        "spare": 5
        "max": 10
      },
      "script": "/www/rails-new-app/config.ru"
  }
}
```

For some reason, the "minimum" number of processes is called "spare". The config above will start 5 processes immediately, and will scale to 10 if the load requires it.

No word yet on if any settings like Puma's `preload_app!` and similar settings in Passenger and Unicorn are available so you will be able to start up processes before they are needed *and* take advantage of copy-on-write memory.

This leaves the application processes. The interesting and novel thing here is that the router does not communicate with the application processes via HTTP - it uses Unix sockets and shared memory. This looks like an optimization aimed at microservice architectures, as communicating between services on the same machine will be considerably faster without any HTTP in between. I have yet to see any Ruby code examples of how this could work, however.

It is unclear to me in the long-term if it is intended for you to run NGINX in front of NGINX Unit, or if NGINX Unit can run on it's own without anything in front of it. As of right now (Q1 2018), you should probably be running NGINX *in front* of NGINX Unit as a reverse proxy, because NGINX Unit lacks static file serving, HTTPS (TLS), and HTTP/2. Obviously, the [integration is pretty seamless](http://unit.nginx.org/integration/).

NGINX Unit is approaching a stable 1.0 release. You can't really run it in production right now for Ruby applications: As I write this sentence, the Ruby module is literally 5 days old. It's still under very active development right now - minor versions are released every few weeks. TLS and HTTP-related features seem like the next "big features" to come down the pipe, with static file serving being next. There is *some* discussion about support for Java, which could probably be turned into support for JRuby and TruffleRuby as well.

There is no Windows support, and I don't think I would hold my breath for any in the future. NGINX Unit only supports Ruby 2.0 and above.

I will not be benchmarking NGINX Unit in this post. It's Ruby module is extremely new and probably not ready for any kind of benchmarking. However, the real reason I won't be benchmarking NGINX Unit against Puma, Unicorn or Passenger is because application server choice in Ruby is not a matter of speed (techincally, latency) but throughput. Application servers tend to differ in *how many requests* they can serve in parallel, rather than *how quickly they do it*. Application servers impose very little latency overhead on the applications they serve, probably on the order of a couple of milliseconds.

The most important Ruby application server setting which affects throughput is *threading*. The reason is that it is the only application server setting which can increase the number of requests served *concurrently*. A multithreaded Ruby application server can make greater and more efficient use of the available CPU and memory resources and serve more requests-per-minute than a single-threaded Ruby application process.

Currently, the only *free* application server which runs Ruby web applications in multiple threads is Puma. Passenger Enterprise will do it, but you must pay for a license.

NGINX Unit plans support for multiple threads in Python applications, so it is not inconceivable that it will support Ruby applications in multiple threads sometime in the future.

So, how does NGINX Unit currently "shake out" in comparison to Unicorn, Passenger and Puma? I think that the traditional Rails application setup: one monolithic application, run on a Plaform-as-a-Service provider like Heroku will probably not see any benefit at all from NGINX Unit's current features and planned roadmap. Puma already serves these users very well.

NGINX Unit may be interesting for Unicorn users who want to stop using a reverse proxy. Once NGINX Unit's HTTP features are fleshed out, it could replace a Unicorn/NGINX setup with just a single NGINX Unit server.

NGINX Unit is probably most *directly* comparable to Phusion Passenger, which also recently went into the "microservice" realm by supporting Javascript and Python as well as Ruby applications. NGINX Unit currently supports more languages and will probably support even more in the future, so those that need greater language support will probably switch. However, Phusion is a Ruby-first company, so I expect Passenger to always "support" Ruby in a better, more complete way than NGINX Unit ever will. And, as mentioned above, Phusion Passenger Enterprise supports multithreaded execution *today*.  

So, what is the ideal NGINX Unit app? If you're running your own cloud (that is, not on a service which manages the routing for you, like Heroku) and you have many Ruby applications running on different Ruby versions or many services in many different languages *and* those services/apps need to talk to each other, quickly, it looks like NGINX Unit was designed for you. If you don't fit that profile, though, it's probably best to stick to the existing top three options (Puma, Passenger, and Unicorn).
