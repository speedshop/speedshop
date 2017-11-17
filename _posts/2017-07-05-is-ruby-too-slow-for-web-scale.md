---
layout: post
title:  "Is Ruby Too Slow For Web-Scale?"
date:   2017-07-11 7:00:00
summary: "Choosing a new web framework or programming language for the web and wondering which to pick? Should performance enter your decision, or not?"
readtime: 3430 words/17 minutes
image: webscale.jpg
---

{% sidenote 1 "Okay, okay, I know. [Betteridge's Law of Headlines](https://en.wikipedia.org/wiki/Betteridge%27s_law_of_headlines). Of course Ruby and Rails are fast enough for big websites - Shopify makes it work and they're one of the largest in the world. But some people *genuinely do seem to think* that Rails 'isn't fast enough'. That's what this article is about." %} How does one choose a framework or programming language for a new web application?

You almost certainly need one, unless you're doing something pretty trivial. All web applications have a lot of boilerplate they need to get running: security, object-relational mapping,
templating and testing. So how do you know which one to choose?

{% marginnote_lazy Tiny-trains-on-track.jpg|This is what Rails is, right?|true %}
Well, you certainly don't want to pick a *slow* framework, do you? That wouldn't be good - we want a *fast*, *modern*, and *lightweight* web framework, not some *heavy*, *old*, *slow*, web framework. Heavy, old, and slow...like Ruby on Rails, right? Ruby on Rails, the king of the all-in-one web framework space for the last 10 years, is constantly under assault by faster, nippier, lighter competitors. Is Rails a dinosaur that can no longer compete?

Well, we could look at some benchmarks to find out. Surely a "fast" and "lightweight" framework would do well on a benchmark, while a old, busted framework would do poorly.

{% marginnote_lazy rails-sucks.png|Yeah! Rails sucks!|true %}
You would be forgiven for thinking that Ruby on Rails was somehow irretrievably graveyard-bound if you looked at the benchmarks posted by sites such as [TechEmpower](https://www.techempower.com/benchmarks/). Sequel author Jeremy Evans recently pointed out that even [other Ruby frameworks can bury Rails](https://twitter.com/jeremyevans0/status/864212426618675200) in these comparisons. You look at those benchmarks at think: "Wow, Sequel is *ten times faster* than ActiveRecord and Rails!"

And in a narrow sense, you'd be right. Benchmarks are like statistics - it's easy to give the right answer to the wrong question, and allow the reader to draw a conclusion which isn't supported by the data. If you looked at those benchmarks and thought: "If I take my Rails application and rewrite it in Sequel and Sinatra, it will be ten times faster than it is now!", you would be wrong.

And, even if it *was* faster, would it matter? **Is there such a thing as a *fast enough* web application?** Just how important is performance when choosing a web framework or even a programming language for a web application?

## Latency and Throughput

Let's start with some definitions.

{% marginnote_lazy funnel.jpg|Servers are like funnels: latency is how long it takes one molecule of water to pass through the funnel, throughput is how much water passes throught the funnel every second. A high-latency high-throughput server would be something like a long, wide tube, and a low-latency low-throughput server would look like a short, wide disc with a narrow opening.|true %}
In server application design, *latency* and *throughput* are king. Latency is the amount of time it takes our server to respond to a single request. *Throughput* is how many requests we can serve at the same time, usually measured in a unit like responses/second.

*Throughput* of a web application is generally governed by CPU and parallelism - how many CPU cycles does it take to respond to a web request, and how efficiently can you saturate all the CPU cores of the host machine? The amount of CPU cycles is governed by the application's domain, framework, and language - complicated apps take more time, and dynamic languages like Ruby generate more CPU instructions than compiled languages like C or Rust. Efficiently using all the available CPU resources varies depending on the language - Go's goroutines, Elixir's "processes", multi-process servers to get around global VM locks like Python and Ruby, event-driven architectures like Node, or true threading like Java.

*Latency*, however, is even more important. This is because *latency is inversely proportional to throughput*. If we halve the latency of our web application, we double its maximum throughput. Latency also affects the end-user experience - a 500 millisecond response time manifests as an extra 500 milliseconds the user must spend waiting for the webpage to load.

## Benchmark Trip-Ups

{% marginnote_lazy topfuel.jpg|TechEmpower's servers|true %}
Let's take a look at the [TechEmpower web framework benchmarks](https://www.techempower.com/benchmarks/). TechEmpower measures latency and maximum throughput across six synthetic benches. These benchmarks are run on pretty fat servers - they've got 4 cpus with 10 cores and 20 threads *each* (so, 40 cores and 80 hyperthreads in total). Oh yeah, and 528 GB of RAM.

{% marginnote_lazy multiquery.png|Rails implementation of the benchmark|true %}
One of the more relevant benchmarks is the multiple-queries benchmark. It's pretty simple - it executes 20 queries, sequentially, against a SQL database, and then returns the result. This is a pretty common web application workload - most Rails applications I've worked on roughly look like this. As we render the template, we execute a few SQL queries to get the results to populate the template, and return it.

In Round 14, the typical Rails setup (puma-mri-rails) clocks in at a measly ~531 requests per second. [Roda](https://github.com/jeremyevans/roda), an *extreme* lightweight Ruby web framework, when used with Sequel, clocks in at about 7000 requests/second, depending on the webserver used.

So does that mean Rails is more than 10 times slower than Roda and Sequel? On an 80 core machine, is 531 requests/second really all you can get out of Ruby on Rails?

TechEmpower's Rails setup is unbelievably crippled compared to their Roda setup. [Their Puma server is configured to run just 8 processes](https://github.com/TechEmpower/FrameworkBenchmarks/blob/e784c36f255b318611d3a0a2c91ad57255eb19d5/frameworks/Ruby/rails/run_mri_puma.sh#L7), while [Roda auto-tunes itself](https://github.com/TechEmpower/FrameworkBenchmarks/blob/master/frameworks/Ruby/roda-sequel/config/mri_puma.rb), ending up with around 100 processes. So the Rails benchmark is using, at best, about 15-20% of the available hyperthreads, while the Roda benchmark is using all of them. So that's *at least* a 5-8x throughput penalty for the Rails benchmark *out of the gate*. But that's fixable - TechEmpower is open source and [we can just open a pull request and fix this](https://github.com/TechEmpower/FrameworkBenchmarks/pull/2850), and we'll get better results for Round 15.

Let's take a look at another TechEmpower measurement - average request latency. Focusing on request latency allows to put all languages and frameworks on a somewhat more even footing, because things like global VM locks and other concurrency features usually don't really matter when processing a single request.{% sidenote 2 "Concurrency features generally increase throughput, not decrease latency." %} On the multiple-query database test, Puma and Rails clock in at 129 milliseconds. The Roda/Sequel/Puma stack clocks in at 31.3 milliseconds.

Now, as I said, the Puma settings for Rails on TechEmpower are incredibly crippled compared to the Roda settings, so Rails could probably still shave a lot off of that time, but let's take it as it is. Let's just say Rails adds **one hundred milliseconds** of latency to the average web application response over a microframework or other competing platform like Phoenix. (Actually, Phoenix is slower on this test than Rails. [The framework creators dispute this result though](https://www.reddit.com/r/elixir/comments/48ke69/any_reason_why_elixirphoenix_did_so_badly_in/), and I don't doubt it if the Rails benchmark is this gimped too).

## The Computer Changes, But The Human Does Not

{% marginnote_lazy room-sized-computer.jpg||false %}
The funny thing about computers is that although they keep getting faster, squishy human beings stay the same speed. Just *how fast* a human-computer interaction has to be has been studied since the 1960s. You can understand their interest in this, back in the times when computers were the size of rooms and computations took hours rather than microseconds. If the computer was going to move out of the mainframe and the science lab and into public life, it was going to have to be faster. But *how much* faster?

[Jakob Nielsen summarized the results in 1993:](https://www.nngroup.com/articles/response-times-3-important-limits/)

{% marginnote_lazy jakob_mouse_big.jpg|Jakob Nielsen. I am glad that this photo exists.|false %}
> 0.1 second: Limit for users feeling that they are directly manipulating objects in the UI. (...)
>
> 1 second: Limit for users feeling that they are freely navigating the command space without having to unduly wait for the computer. (...)
>
> 10 seconds: Limit for users keeping their attention on the task. (...)

You can read his full article on the topic [here](https://www.nngroup.com/articles/response-times-3-important-limits/).

### On the web, how fast is fast enough?

Let's assume that all our little web application does is return an HTML response with *no* JavaScript or CSS. It's just a flat, HTML document with the default browser styling.{% sidenote 3 "Imagine if you would, for a moment, a website whose styling is even more boring than this one." %} How long would it take for a user to visit `www.oursite.com` and receive a response?

Well, if our user is on a desktop computer in the same country as our servers, it will take about 20 milliseconds for their packets to get from their computer to our servers, and another 20 milliseconds back. This is a *best case scenario*: if they're on the other side of the world, this could easily be 100 milliseconds each way. If they're on a mobile cellular connection, we're talking ~300-400 milliseconds. My home DSL connection fluctuates from 50-150 milliseconds to most US servers.

{% marginnote_lazy brentrambo.gif|150 milliseconds time-to-first-byte? That's Brent Rambo Approved.|false %}
So, if we've already got ~40 milliseconds of round-trip network latency in the first place, will our users be able to perceive the difference in a web application which renders a response in 1 millisecond or 100 milliseconds? That is, one application will take 41 milliseconds in total and the other 141. The answer **is emphatically no**. Both applications will appear almost instantaneous to the user. And in the worst cases of network conditions, the difference will completely vanish. So minor latency differences (100 milliseconds or less, as in the difference between web frameworks) only matter in their contribution to improving throughput.

### Your Server is Just a Small Part of the User Experience

{% marginnote_lazy modern-web.png|WELCOME TO THE MODERN WEB, BITCH.|false %}
It's 2017 and web applications don't return flat HTML files anymore. Websites are gargantuan, with JavaScript bundles stretching into the size of megabytes and stylesheets that couldn't fit in ten Apollo Guidance Computers. So how much of a difference does a web application which responds in 1 millisecond or less make in this environment?

Vanishingly little. Nowadays, the average webpage takes 5 seconds to render. Some JavaScript single-page-applications can take 12 seconds or more on initial render.

Server response times simply make up a teeny-tiny part of the actual user experience of loading and interacting with a webpage - cutting 99 milliseconds off the server response time just doesn't make a difference.

### There's a Ceiling: Web Apps Aren't Video Games

In the video gaming world, speed matters. Faster languages can mean more polygons on the screen per frame. There's really no upper limit for this - more polygons will always be good, so a faster language will always help with increasing the fidelity of the simulation.
{% marginnote_lazy sortafast.gif|[for those unfamiliar with the meme](https://www.youtube.com/watch?v=hU7EHKFNMQg)|false %}

Web applications are not like this. Fundamentally, 90% of them are simple CRUD applications. A faster language does not open more possibilities for functionality or features, it just takes the same HTML webform we've been rendering and renders it a few milliseconds faster. There's a *ceiling* on the usefulness of reduced request latency.

### Ruby is Slow, so More Ruby is Slower

{% marginnote_lazy hashtables.png|[Mike Perham](https://twitter.com/mperham/status/884126933255995392). And, ultimately, most of Ruby's internals boil down to hash tables, so...|true %}
Ruby isn't a fast language. So, if you execute less of it, you'll have a faster benchmark result.

Feature-rich frameworks like Rails have a *lot* of code, and execute a lot more on each request because they are *doing more stuff*.

This seems like 101-level stuff, but again, TechEmpower and other benchmarks typically do *not* make the difference in features obvious. On TechEmpower, all you get is this impossible-to-skim array of tags.

{% marginnote_lazy techempower.png|Yes, this is is an easy-to-understand feature comparison which humans can read.|true %}
On throughput microbenchmarks like TechEmpower, where differences are measured in milliseconds (or even microseconds), what you're really measuring is how many *CPU instructions* a particular language runtime generates in response to a particular request. And since there's no real way to compare featuresets between frameworks on TechEmpower, all frameworks are placed on an "equal footing" and you'll think that Rails is the slowest web framework in the world.

The truth is that Rails does *a lot* on every request. Just create a new Rails app and look at the middleware stack (`rake middleware`). There's a lot of work being done here that *every good web application should do* but many frameworks *do not do for you*, at least by default.

### Performance is More Complicated than CPU or Maximum Throughput

While on TechEmpower CPU usage is the bottleneck, in the real world, the CPU performance of language or the framework is almost never the *bottleneck* for a web application's performance. Web applications are fairly I/O heavy, especially as they grow more complicated. The modern Rails application may interact with three separate databases or more - their SQL database, Redis for their backend job processor, and Memcache for caching. Often, time spent interacting with these databases can make up 25% or more of a response.

In addition, as a Ruby on Rails performance consultant, I've seen so many problems with application deployments that have nothing to do with the CPU performance of the framework or language: poor server configurations, memory leaks or bloat, or poor use of caching. Programmers, mysteriously, seem to find a way to completely degrade the performance of their application all on their own!

Finally, most mature web applications spend *at most* 50% of their execution time in the framework itself, and far more time in the actual application code and other added dependencies. This is pretty easy to see in Ruby - take a look at a stacktrace and count how many of the top frames are from your framework. It won't be many. If your application could be rewritten in a faster framework in the same language, you would halve its response times *at best*.

## Rewrite Your Entire Application to Save $1,000/month

What I worry about is what people do with the information presented in relative benchmarks like TechEmpower. Do they go home and rewrite their applications in the flavor-of-the-week framework or stack? Or, when choosing a stack for a *new* product or service, do people choose the "faster" stack over the "slower" one?

[Heck, Pinterest rewrote it's Ads API in Elixir and now they have response times of less than a millisecond.](https://medium.com/@Pinterest_Engineering/introducing-new-open-source-tools-for-the-elixir-community-2f7bb0bb7d8c) Surely, that's just *better*, right?

The question is, *why*? As we've already established, there's no difference for the end-user experience. So there's really only two reasons to choose a framework over another: a) it's faster and therefore I'll spend less on server costs to host it b) it's easy to develop with, and helps me ship quality features faster.

Let's take a look at that server cost one, for a second.

The majority of web applications handle far less than 1000 requests per second. I'd go as far as to say that most web application developers are employed by a company whose entire webapp does far less than 1000 requests/second. Most of them do less than 1000 requests/*minute*.

Let's say you have a Rails application which serves 20,000 RPM (request/minute, or about 300 req/sec) at an average response time of 250 milliseconds. That's a pretty average profile for a large, mature Rails application. Such an application will take about 200 Puma processes to serve properly. That's equal to roughly a dozen Performance-L dynos on Heroku, or $6,000/month.

Now, let's say you rewrite it in Phoenix, Node, or whatever flavor of the week you want and reduce that to 125 milliseconds. Before you jump out of your seat, remember that you're not going to reduce latency to 12 milliseconds or some other stupid-low amount: you're still going to be limited by I/O to the databases that back this application.

Halving our application's latency means we need about half the amount of servers we needed before. So, congratulations: you rewrote your application (or chose your framework) to save $3,000/month. The load on the relational database backing this application won't change, so those costs will remain the same. When your application is big enough to be doing 20,000 RPM, you will have anywhere from a half-dozen to even fifty engineers, depending on your application's domain. A single software engineer costs a company at least $10,000/month in employee benefits and salary. So we're choosing our frameworks based on saving one-third of an engineer per month? And if that framework caused your development cycles to slow down by even *one third* of a mythical man-month, you've *increased* your costs, not decreased them. Choosing a web framework based on server costs is clearly a sucker's game.

Why cargo-cult engineering practices from huge companies where a few milliseconds can save tens of thousands per month? You're not Pinterest (or Netflix, or...), you have different problems, and that's OK.

### It Isn't Getting Worse

Computers aren't getting slower. While [Wirth's Law](https://en.wikipedia.org/wiki/Wirth%27s_law){% sidenote 4 "Software is getting slower more rapidly than hardware becomes faster." %} certainly holds for most end-user applications like your mobile phone apps, it doesn't really hold for your typical web application. Ruby web applications (and any web application) will continue to get faster because the slow grind of progress in hardware will continue to find ways to jam more CPU instructions into a clock cycle, or to make those clock cycles even faster, or to cram more cores onto a die.  

And the language isn't getting slower, either. Noah Gibbs of Appfolio has shown that [each minor version of Ruby decreases average response times by about 5-10%.](http://engineering.appfolio.com/appfolio-engineering/2017/5/22/rails-speed-with-ruby-240-and-discourse-180)

## Let's Talk About Happiness

The performance doomsayers have always been wrong, and will continue to be wrong. [Take this gentleman from 2007](http://archive.oreilly.com/pub/post/multicore_hardware_and_the_fut.html):

> No matter what implementation becomes the next de-facto Ruby platform, one thing is clear: People are interested in taking advantage of their newer, more powerful multi-core systems (as the recent surge in interest in Erlang in recent RailsConf and RubyConfs has shown). As Ruby becomes increasingly part of solutions that deal in high volumes of data processing, this demand can only increase.

Ten years later, and scaling across multiple cores through preforking webservers like Puma and Unicorn is still plenty Good Enough. Ruby still isn't dead. I'm excited for the possibilities afforded by the [proposed Guild model](http://olivierlacan.com/posts/concurrency-in-ruby-3-with-guilds/), but is the language unusable until then? Nope.

What I want is for the conversation around web frameworks and programming languages to change. There's too much talk of performance and concurrency, when in reality the margins are narrow and the costs minimal and getting lower. Languages aren't dying based on their concurrency or performance features alone.

The better conversation, the more meaningful and impactful one, is which framework **helps me write software faster, with more quality, and with more happiness**. I know what the answer to that question is for me, and maybe the answer is different for you.

### "Polyglots" and "The New Hotness Stack"

There's a subset of engineers who will never be happy writing software which isn't on the "new hotness stack". Engineers are always looking for a new problem to solve, something new to learn - and that's great! I've never related. GORUCO, the NYC Ruby conference started calling itself a "polyglot conference" this year, and the speaker schedule features talks on Python, Elixir, Rust, React and static typing. [Conference organizer Mike Dalessio's blog post announcing this](https://medium.com/@flavorjones/ruby-values-7b5ffe45aea7) reads like a tombstone.

Benchmarks are often waved around in this "is X dead" discussion. As I hope I've shown above, there really is no benchmark which can prove that any language or framework is not suitable for writing web applications. Performance isn't the concern.

Instead, the performance discussion regarding web applications is mostly FUD, spread by those trying to justify the engineering time they just spent rewriting their entire stack or what they're telling management so that they get to play with the coolest new toy they saw on Hacker News.

Programmers are perpetually terrified of career obsolescence. Some are afraid of intellectual stagnation - that they'll become the crusty old person in the back office writing RPG to keep a truck parts company's order system running. But almost all of them are afraid of unemployment. They're worried that the world will move on from their particular stack, leaving their salaries and jobs in jeopardy. These fears are real - but let's realize that most of the discussion around "is stack X dead?!" are driven by *fear*, not concerns for the *requirements* of web applications.

## Fun and Games

Let's be clear - performance still matters. Most organizations can and should save on server costs by focusing on speeding up their endpoints, and particularly slow endpoints probably do impact the customer experience [or the bottom line](https://wpostats.com/tags/revenue/) and should be sped up. What I've talked about above is just how little *framework choice* matters in the performance of your web application.

Also, I'm not ragging on TechEmpower. It's a massive project, and they depend on domain experts creating PRs that fix any problems with the results. They're genuinely good people in my opinion, and aren't trying to push an agenda or participate in benchmarketing in favor of any particular stack.

In conclusion, JavaScript, Go, Elixir and Python all suck, write Ruby :) No, of course not - write what you're productive in. If you're a web programmer, count your lucky stars that you get to choose your tools based on ergonomics, not on performance.

<blockquote class="twitter-tweet" data-conversation="none" data-lang="en"><p lang="en" dir="ltr">The highest rule of computing: computers SHOULD exist to accommodate their creators, never the other way around.</p>&mdash; Gary Bernhardt (@garybernhardt) <a href="https://twitter.com/garybernhardt/status/879945502556422144">June 28, 2017</a></blockquote>
<script async src="//platform.twitter.com/widgets.js" charset="utf-8"></script>
