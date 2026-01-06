---
layout: post
title:  "Railsconf 2017: The Performance Update"
date:   2017-05-25 7:00:00
summary: "Did you miss Railsconf 2017? Or maybe you went, but wonder if you missed something on the performance front? Let me fill you in!"
readtime: 2330 words/12 minutes
image: railsconf.jpg
---

{% marginnote_lazy sleepycat.gif|When you just can't conf any more|true %}
Hello readers! Railsconf 2017 has just wrapped up, and as I did for [RubyConf 2016](/blog/rubyconf-2016-performance-update/), here’s a rundown of all the Ruby-performance-related stuff that happened or conversations that I had.

## Bootsnap

Shopify recently released [bootsnap](https://github.com/Shopify/bootsnap), a Rubygem designed to boot large Ruby apps faster. It was released just a week or so before the conference, but Discourse honcho [Sam Saffron](https://twitter.com/samsaffron) was telling everyone about how great it was. It's fairly infrequently that someone is able to come up with one of these "just throw it in your Gemfile and voila your app is faster" projects, but it looks like this is one of them. {% marginnote_lazy ohno.gif|50% faster, you say?|true %} [Bootsnap reduced bootup time in development for Discourse by 50%.](https://gist.github.com/SamSaffron/d4f733108fe261815678b52b1a22f4b7)

You may have heard of or used [bootscale](https://github.com/byroot/bootscale) - Bootsnap is intended to be an evolution/replacement of that gem.

How does it work? Well, unlike a lot of performance projects, [Bootsnap's README is actually really good](https://github.com/Shopify/bootsnap) and goes into depth on how it accomplishes these boot speedups. Basically, it does two big things: makes `require` faster, and caches the compilation of your Ruby code.

The `require` speedups are pretty straightforward - `bootsnap` uses caches to reduce the number of system calls that Ruby makes. Normally if you `require 'mygem'`, Ruby tries to open a file called `mygem.rb` on *every folder on your LOAD_PATH*. Ouch. Bootsnap thought ahead too - your application code is only cached for 30 seconds, so no worries about file changes not being picked up.

The second feature is caching of compiled Ruby code. This idea has been around for a while - if I recall, [Eileen Uchitelle](https://twitter.com/eileencodes) and [Aaron Patterson](https://twitter.com/tenderlove) were working on something like this for a while but either gave up or got sidetracked. Basically, Bootsnap stores the compilation results of any given Ruby file *in the extended file attributes of the file itself*. It's a neat little hack. Unfortunately it doesn't really work on Linux for a few reasons - if you're using ext2 or ext3 filesystems, you probably don't have extended file attributes turned on, and even if you did, [the maximum size of xattrs on Linux is very, very limited](https://github.com/Shopify/bootsnap/issues/20) and probably can't fit the data Bootsnap generates.

There was some discussion at the conference that, eventually, the load path caching features could be merged into Bundler or Rubygems.

## Frontend Performance

{% marginnote_lazy noooo.gif|When the conf wifi doesn't co-operate|true %}

I gave a workshop entitled "Front End Performance for Full-Stack Developers". The idea was to give an introduction to using Chrome's Developer Tools to profile and diagnose problems with first page load experiences.

I thought it went *okay* - on conference wifi, many of the pages I had planned to use as examples suddenly had far far different load behaviors than what I had practiced with, so I felt a little lost! However, it must have gone *okay*, as [Richard](https://twitter.com/schneems) managed to [halve CodeTriage's paint times](https://github.com/codetriage/codetriage/pull/540) by marking his Javascript bundle as `async`.

## Application Server Performance

After a recent experience with a client, I had a mini-mission at Railsconf to try to diagnose and improve some issues with performance in [`puma`](https://github.com/puma/puma/).

The issue was with how Puma processes accept requests for processing. Every Puma process ("worker") has an internal "reactor". The reactor's job is to [listen to the socket](https://github.com/puma/puma/blob/master/lib/puma/reactor.rb#L29), buffer the request, and then hand requests to available threads.

{% marginnote_lazy pumareactor.gif|Puma's reactor, accepting requests|true %}

The problem was that Puma's default behavior is for the reactor to *accept as many requests as possible, without limit*. This leads to poor load-balancing between Puma worker processes, especially during reboot scenarios.

Imagine you've restarted your `puma`-powered Rails application. While you were restarting, 100 requests have piled up on the socket and are now waiting to be processed. What *could* sometimes happen is that just a *few* of those Puma processes could accept a majority of those requests. This would lead to excessive request queueing times.

This behavior didn't make a lot of sense. If a Puma worker has 5 threads, for example, why should it *ever* accept more than 5 requests at a time? There may be other worker processes that are completely empty and waiting for work to do - we should let those processes accept new work instead!

So, [Evan fixed it](https://github.com/puma/puma/commit/482ea5a24abaccf33c49dc9238a22e2a9affe288). Now, Puma workers will not accept more requests than they could possibly process at once. This should really improve performance for single-threaded Puma apps, and should improve performance for multithreaded apps too.

In the long term, I still think request load-balancing could be improved in Puma. For example - if I have 5 Puma worker processes, and 4 currently have a request being processed and 1 is completely empty, it's possible that a new request could be picked up by one of the already-busy workers. For example, if we're using MRI/CRuby and one of those busy workers hits an IO block (say it's waiting on a result from the database), it could pick up a new request instead of our totally-free worker. That's no good. And, as far as I know, routing is *completely random* between all the processes available and listening to the socket.

Basically, the only way Puma can "get smarter" with it's request routing is to put some kind of "master routing process" on the socket, instead of letting the Puma workers listen directly to the socket themselves. One idea Evan had was to just put the Reactor (the thing that buffers and listens for new requests) in Puma's "master" process, and then have the master process decide which child process to give it to. This would let Puma implement more complex routing algorithms, such as round-robin or Passenger's ["least-busy-process-first"](https://www.phusionpassenger.com/library/indepth/ruby/request_load_balancing.html).

Speaking of Passenger, Phusion founder Hongli spitballed the idea that Passenger could even act as a reverse proxy/load-balancer for Puma. It could definitely work (and would give Puma other benefits like offloading static file serving to Passenger) but I think Puma using the master process as a kind of "master reactor" is more likely.

## rack-freeze

{% marginnote_lazy dicey.gif|Is my app threadsafe? Survey says... definitely maybe.|true %}

One question that frequently comes up around performance is "how do I know if my Ruby application is thread-safe or not?" My stock is answer is usually to [run your tests in multiple threads](https://github.com/seattlerb/minitest/blob/master/lib/minitest/test.rb#L46-L46). There are two problems with this suggestion though - one, you can't run RSpec in multiple threads, so this is Minitest-only, and two, this really only helps you find threading bugs in your unit tests and application units, it doesn't cover most of your dependencies.

One source of threading bugs is Rack middleware. Basically, the problem looks something like this:

```ruby
class NonThreadSafeMiddleware
  def initialize(app)
    @app = app
    @state = 0
  end

  def call(env)
    @state += 1

    return @app.call(env)
  end
end
```

A interesting way to surface these problems is to just `freeze` everything in all of your Rack middlewares. In the example above, `@state += 1` would now blow up and return a RuntimeError, rather than just silently adding incorrectly in a multithreaded app. That's exactly what [rack-freeze](https://github.com/ioquatix/rack-freeze) does (which is where the example above is from). [Hat-tip to @schneems](https://twitter.com/schneems) for bringing this up.

## snip_snip

When talking to [Kevin Deisz](https://twitter.com/kddeisz) in the hallway (I don't recall what about), he told me about his gem called [`snip_snip`](https://github.com/kddeisz/snip_snip). Many of you have probably tried `bullet` at some point - [`bullet`](https://github.com/flyerhzm/bullet)'s job is to help you find N+1 queries in your app.

`snip_snip` is sort of similar, but it looks for database columns which you `SELECT`ed but didn't use. For example:

```ruby
class MyModel < ActiveRecord::Base
  # has attributes - :foo, :bar, :baz, :qux
end

class SomeController < ApplicationController
  def my_action
    @my_model_instance = MyModel.first
  end
end
```

...and then...

```
# somewhere in my_action.html.erb

@my_model_instance.bar
@my_model_instance.foo
```

...then `snip_snip` will tell me that I `SELECT`ed the `:baz` and `:qux` attributes but didn't use them. I could rewrite my controller action as:

```ruby
class SomeController < ApplicationController
  def my_action
    @my_model_instance = MyModel.select(:bar, :foo).first
  end
end
```

Selecting fewer attributes, rather than *all* of the attributes (default behavior) can provide a decent speedup when you're creating many (hundreds or more, usually) ActiveRecord objects at once, or when you're grabbing objects which have many attributes (User, for example).

## Inlining Ruby

In a hallway conversation with [Noah Gibbs](https://twitter.com/codefolio?lang=en), Noah mentioned that he's found that increasing the compiler's *inline threshold* when compiling Ruby can lead to a minor speed improvement.

The *inline threshold* is basically how aggressively the compiler decides to copy-paste sections of code, *inlining* it into a function rather than calling out to a separate function. Inlining is usually always faster than jumping to a different area of a program, but of course if we just inlined the entire program we'd probably have a 1GB Ruby binary!

[Noah found that increasing the inline threshold a little led to a 5-10% speedup on the optcarrot benchmark](https://bugs.ruby-lang.org/issues/12599), at the cost of a ~3MB larger Ruby binary. That's a pretty good tradeoff for most people.

Here's how to try this yourself. We can pass some options to our compiler using the `CFLAGS` environment variable - if you're using Clang (if you're on a Mac, this is the default compiler):

```
CFLAGS="-O3 -inline-threshold=5000"

Example with ruby-install
ruby-install ruby 2.4.0 -- --enable-jemalloc CFLAGS="-O3 -inline-threshold=5000"
```

If you're using GCC:

```
CFLAGS="-O3 -finline-limit=5000"
```

I wouldn't try this in production *just yet* though - it seems to cause a few segfaults for me locally from time to time. Worth playing around with on your development box though!

## Your App Server Config is Wrong

I gave a sponsored talk for Heroku that I titled "Your App Server Config is Wrong". Confreaks still hasn't posted the video, but [you can follow me on Twitter](https://twitter.com/nateberkopec) and I'll retweet it as soon as it's posted.

Basically, the number one problem I see when consulting on people's applications is misconfigured app servers (Puma, Unicorn, Passenger and the like). This can end up costing companies thousands of dollars a month, or even costing them 30-40% of their application's performance. Bad stuff. Give the talk a watch.

## Performance Panel

On the last day of the conference, Sam Saffron hosted a panel on performance with [Richard](https://twitter.com/schneems), [Eileen](https://twitter.com/eileencodes), [Rafael](https://twitter.com/rafaelfranca) and myself. [Here's the video.](http://confreaks.tv/videos/railsconf2017-panel-performance-performance)

Attenddee Savannah made this cool mind-mappy-thing:

<blockquote class="twitter-tweet" data-conversation="none" data-lang="en"><p lang="en" dir="ltr">the penultimate talk: a panel on performance with <a href="https://twitter.com/nateberkopec">@nateberkopec</a> <a href="https://twitter.com/rafaelfranca">@rafaelfranca</a> <a href="https://twitter.com/samsaffron">@samsaffron</a> <a href="https://twitter.com/schneems">@schneems</a> <a href="https://twitter.com/eileencodes">@eileencodes</a> <a href="https://twitter.com/hashtag/railsconf?src=hash">#railsconf</a> <a href="https://t.co/srRe4ebPSW">pic.twitter.com/srRe4ebPSW</a></p>&mdash; savannah (@Savannahdworth) <a href="https://twitter.com/Savannahdworth/status/857735502274768896">April 27, 2017</a></blockquote>
<script async src="//platform.twitter.com/widgets.js" charset="utf-8"></script>

## More Performance Talks

There are a few more talks from Railsconf you should watch if you're interested in Ruby performance:

* [5 Years of Scaling Rails to 80,000 RPS](http://confreaks.tv/videos/railsconf2017-5-years-of-rails-scaling-to-80k-rps) with Simon Eskildsen of Shopify. Simon's talks are always really good to begin with, so if you want to hear how Rails is used at one of the top-100 sites by traffic *in the world*, you should probably watch this talk.
* [The Secret Life of SQL: How to Optimize Database Performance](http://confreaks.tv/videos/railsconf2017-the-secret-life-of-sql-how-to-optimize-database-performance) A (short) introduction to making those SQL queries as fast as possible from Bryana Knight, mostly discussing indexes and how you know if they're being used.
* [High Performance Political Revolutions](http://confreaks.tv/videos/railsconf2017-high-performance-political-revolutions) Another "performance war story" from Braulio Carreno.

## Secret Project  

So, I won't go into *too much* detail here, but *somebody* showed me a very cool JavaScript project which was basically a "Javascript framework people who don't have a single-page-app". It looked like it would work extremely well with Turbolinks applications, or just apps which have a lot of Javascript behaviors but don't already use another framework. If you could imagine "Unobtrusive JavaScript: The Framework", that's what this looked like. I'll let you know when this project gets a public release.

{% marginnote_lazy nogoingback1.gif|Son, once you start adding stuff to $(document).ready...|true %}

One of Turbolinks' problems, IMO, is that it lacks a lot of teaching resources or pedagogy around "How To Build Complex Turbolinks-enabled Applications". Turbolinks requires a different approach to JavaScript in your app, and if you try to use an SPA framework such as Backbone or Angular with it, or if you try to just write your JavaScript the way you had before by dumping the kitchen sink into `turbolinks:load` hooks, you're Gonna Have a Bad Time. This framework looks like it could fix that by providing a "golden path" for attaching behaviors to pages.

## HTTP/2

This was touched on briefly in Aaron's keynote, but in hallway conversations with [Aaron](https://github.com/tenderlove) and [Evan](https://github.com/evanphx), the path forward on HTTP/2 support in Rack was discussed.

I've advocated that you [just throw an HTTP/2-enabled CDN in front of your app and Be Done With It](/blog/what-http2-means-for-ruby-developers/) before, and Aaron and I pretty much agree on that. Aaron wants to add an HTTP/2-specific key to the Rack env hash, which could take a callback so you can do whatever fancy HTTP/2-y stuff you want in your application if Rack tells you it's an HTTP/2-enabled request. I see the uses of this being pretty limited, however, as Server Push can mostly [be implemented by your CDN](https://blog.cloudflare.com/announcing-support-for-http-2-server-push-2/) or [your reverse proxy](https://h2o.examp1e.net/configure/http2_directives.html).

## RPRG/Chat Update

In [my Rubyconf 2016 update](/blog/rubyconf-2016-performance-update/), I said:

> Finally, there was some great discussion during the Performance Birds of a Feather meeting about various issues. Two big things came out of it - the creation of a Ruby Performance Research Group, and a Ruby Performance community group.

I want to say I'm *still working* on both of these projects. You should see something about the Research Group *very soon* (I have something *I* want to test surrounding memory fragmentation in highly multithreaded Ruby apps) and the community group some time after that.

## And Karaoke!

{% marginnote_lazy karaoke.gif|[Jon McCartie](https://twitter.com/jmccartie), everyone|true %}

That pretty much sums up my Railsconf 2017. Looking forward to next year, with even more Ruby performance and karaoke.
