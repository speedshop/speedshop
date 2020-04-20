---
layout: post
title:  "How to Measure Ruby App Performance with New Relic"
date:   2015-10-15 7:00:00
summary: New Relic is a great tool for getting the overview of the performance bottlenecks of a Ruby application. But it's pretty extensive - where do you start? What's the most important part to pay attention to?
readtime: 3493 words/17 minutes
wordcount: 3493
---

It's 12pm on a Monday. Your boss walks by: "The site feels...slow. I don't know, it just does." Hmmm. You riposte with the classic developer reply: "Well, it's fast on my local machine." Boom! Boss averted! {% marginnote_lazy https://i.imgur.com/D20c1vk.gif||true %}

Unfortunately, you were a little dishonest. You know better than to think that speed in the local environment has anything to do with speed in production. You know that, right? Wait, we're not on the same page here?

Several factors can cause Ruby applications to have performance discrepancies between production and development:

* **Application settings, like code reloading** Rails and most other Ruby web frameworks reload (almost) all of your application code on every request to pick up on changes you've made to files. That's a pretty slow process. In addition, there a lot of subtle differences between apps in development and production modes, especially surrounding asset pipelines. Simpler frameworks may not have these behaviors, but don't kid yourself - if anything in your app is changing in response to "RACK_ENV", you could be introducing performance problems that you can't catch in development.
* **Caching behavior** Rails disables caching in development mode by default. Obviously, turning that on has a big performance impact in production. In addition, caches in development work differently than caches in production, mostly due to the introduction of network latency. Even 10ms of network latency between your application server and your cache store can cripple pages that make many cache calls.
* **Differences in data** {% marginnote_lazy https://i.imgur.com/l1rvh6w.jpg %} This is an insidious one, and the usual cause for an app that seems slow in production but fast in development. Sure, that query you run locally (User.all, for example) only returns 100 rows in development using your seed data. But in production, that query could return 10,000 or 100,000 rows! In addition, consider what happens when those 10,000 rows you return need to be attached to 10,000 other records because you used `includes` to pre-load them. Get ready to wait around.
* **Network latency** It takes time for a TCP packet to go from one place to another. And while the speed of light is fast, it does add up. As a rule of thumb, figure 10ms for the same city, 20ms for a state or two away, 100ms across the US (from NY to CA), and up to 300ms to get to the other side of the world. These numbers can quadruple on mobile networks. This has a major impact when a page makes many asset requests or has blocking external JavaScript resources.
* **JavaScript and devices** JavaScript takes time and CPU to execute. Most people don't have fancy new MacBooks like we developers do - and on mobile devices the story is certainly even worse. Consider that even a low-end desktop processor sports twice the computing power of top-end mobile CPUs and you can see how complex Javascript that "feels fine on my machine" can grind a mobile device to a halt.
* **System configuration and resources** Unless you're using containers, system configuration will always differ between environments. This can even be as subtle as utilities being compiled with different compiler flags! Of course, even containers will run on different physical hardware, which can have severe performance consequences, especially regarding threading and concurrency.
* **Virtualization** Most people deploy to shared, virtualized environments nowadays. Unfortunately, that means a physical server will share resources with up to half-a-dozen or so virtual servers, which can negatively and unpredictably impact performance when one virtualized server is hogging up the resources available.

So what's a developer to do? Why, install a performance monitoring solution in production! NewRelic is the tool I reach for. Not only is it free to start with, the tools included are extensive, even at the free level. In this post, I'm going to give you a tour of each of NewRelic's features and how they can help you to diagnose performance hotspots in a Rails app.

**Full disclosure** - I don't work work New Relic, and no one from New Relic paid for or even talked to me about this post. I haven't used [Skylight](https://www.skylight.io/), New Relic's biggest competitor in this space, so I can't give you a good comparison of the two or their features. I hope to someday do a post on Skylight, but I'll need a production app I can use it on first.

## Pareto and Zipf

Before we get into any code or fancy graphs, though, I want to talk about principles. Actually, I want to tell you about an American linguist and an Italian economist.

{% marginnote_lazy https://i.imgur.com/RbKfDx7.jpg %}George Kingsley Zipf was an American philologist that studied languages using a new and interesting field at his time - statistics. Zipf's novel idea to apply statistics to the study of language landed him an astonishing insight: in nearly every language, some words are used *a lot*, but most (nearly all) words are used hardly at all. That is to say, if you took every English word ever written and plotted the frequency of words used as a histogram, you'd end up with a graph that looked something like what you see to the right. It's a power law.

The [Brown Corpus](https://en.wikipedia.org/wiki/Brown_Corpus) is 500 samples of English-language text comprising 1 million words. But just 135 unique words are needed to account for 50% of those million. That's insane.

If you take Zipf's probability distribution and make it continuous instead of discrete, you get the **Pareto distribution**.

Many of you probably see where I'm going with this by now. Stay with me.

{% marginnote_lazy https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Probability_density_function_of_Pareto_distribution.svg/500px-Probability_density_function_of_Pareto_distribution.svg.png %}The Pareto distribution, pictured at right, has been found to hold for a *scary* number of completely different and unrelated fields in the sciences. For example, here are some natural phenomena that exhibit a Pareto (power law) distribution:

* Wealth inequality
* Sizes of rocks on a beach
* Hard disk drive error rates (!)
* File size distribution of Internet traffic (!!!)

We tend to think of the natural world as *random* or *chaotic*. But often, it is anything but. Many probability distributions, in the wild, support the Pareto Principle:

> 80% of the output will come from 20% of the input

While you may have heard this before, what I'm trying to get across to you is that isn't made up. The Pareto distribution is the real deal - utilized in hundreds of otherwise completely unrelated scientific fields - and we can use it's ubiquity to our advantage.

Allow me to reformulate and apply this to web application performance:

> **80% of an application's work occurs in 20% of it's code.**

{% marginnote_lazy https://i.imgur.com/fliqI9N.gif|I pity the fool that prematurely optimizes their application! %}This is why premature optimization is so bad and why performance  monitoring, profiling and benchmarking are so important. What the Pareto Principle reveals to us is that optimizing any random line of code in our application is in fact *unlikely* to speed up our application at all! 80% of the "slowness" in any given app will be hidden away in a minority of the code. So instead of optimizing blindly, applying principles at random we read from blog posts or engaging in Hacker-News-Driven-Development by using the latest and "most performant" web technologies, we need to *measure* where the bottlenecks and problem areas are in our application.

Repeat after me: I will not optimize anything in my application until my metrics tell me so.

## Getting an Overview

Let's walk through the process I use when I look at a Ruby app on NewRelic.

When I first open up a New Relic dashboard, I'm trying to establish the broad picture: How big is this application? Where does most of its time go? Are there are any "alarm bells" going off just on the main dashboard?

### A Glossary

New Relic uses a couple of terms that we'll need to define:

* **Transactions** This is New Relic's cross-platform way of saying "response". In Rails, a single "transaction" would be a single response from a controller action. Transactions from a Rails app in NewRelic look like "WelcomeController#index" and so on.

* **Real-User Monitoring (also RUM and Browser monitoring)** {% marginnote_lazy https://i.imgur.com/UfGgA6g.jpg|Too much rum, though, and you start wearing eyeshadow. %} If you enable it, New Relic will automatically insert some Javascript for you on every page. This Javascript hooks into the  [NavigationTimingAPI](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_timing_API) of the browser and sends several important metrics back to NewRelic. Events set include domContentLoaded, domComplete, requestStart and responseEnd. Any time you see NewRelic refer to "real-user monitoring" or "browser metrics", they're referring to this.

### Response time - where does it go?

The web transaction response time graph is one of the most important on NewRelic, and forms the broadest possible picture of the backend performance of your app. NewRelic defaults to 30 minutes as the the timeframe, but I immediately change this to the longest interval available - preferably about a month, although 7 days will do.

The first thing I'll look at here is the app server and browser response averages. Here are some rules of thumb for what you should expect these numbers to be in an average Rails application:

| App server avg response time | Status |
| -------- | -------- |
| < 100ms | Fast! |
| < 300ms | Average |
| > 300ms | Slow! |

Of course, those numbers are just rules of thumb for Rails applications that serve up HTML - your typical "Basecamp-style" application. For simple API servers that serve JSON only, I might divide by 2, for example.


| Browser avg load time | Status |
| -------- | -------- |
| < 3 sec | Fast! |
| < 6 sec | Average |
| > 6 sec | Slow! |

{% marginnote_lazy https://i.imgur.com/vmp1svR.gif||true %}I can hear the keyboards clattering already furiously emailing me: "That's so slow! Rails sucks! Blah blah..."

I'm just sharing what I've seen in the wild in my own experience. Remember - Github, Basecamp and Shopify are all *enormous* WebScale™ Ruby shops that average 50-100ms responses, which is pretty good by anyone's measure.

Based on what I'm seeing with these numbers, I know where to pay attention later on. For example, if I notice a fast or average backend but slow browser (real-user monitoring) numbers, I'll go look at the browser numbers next rather than delving deeper into the backend numbers.

Note that most browser load times are 1-3 seconds, while most application server response times are 1-300 milliseconds. Application server responses, *on average*, are just 10% of the end-users total page loading experience. This means front-end performance optimization is actually far more important that most Rails developers will give it credit for. Back-end optimization remains important for scaling (lower response times mean more responses per second), but when thinking about the browser experience, they usually mean vanishingly little.

Next, I'm considering the shape of the response time graph. Does the app seem to slow down at certain times of day or during deploys?

The most important part of this graph, though, is to figure out how much time goes to what part of the stack. Here's a typical Ruby application - most of its time is spent in Ruby. If I see an app that spends a lot of time in the database, web external, or other processes, I know there's a problem. Most of your time should be spent in Ruby (running Ruby code is usually the slowest part of your app!). If, for example, I see a lot of time in web external, I know there's probably a controller or view that's waiting, synchronously, on an external API. That's almost never necessary and I'd work to remove that. A lot of time in request queueing means you need more servers, because requests are spending too much time waiting for an open application instance.

#### Percentiles and Histograms

{% marginnote_lazy https://i.imgur.com/KZhqgxR.png %}The histogram makes it easy to pick out what transactions are causing extra-long response times. Just click the histogram bars that are way far out to the right and pay attention to what controllers are usually causing these actions. Optimizing these transactions will have the biggest impact on 95% percentile response times.

Most Ruby apps response time histograms look like an power curve. Remember what I said above about Pareto. So, conversely, be sure to check out what actions take the least amount of time (the histogram bar furthest to the left). Are they asset requests? Redirects? Errors? Is there any way we can *not* serve these requests (in the case of assets, for example, you should be using a CDN)?

### What realm of RPM are we playing in?

{% marginnote_lazy https://i.imgur.com/cEKvA82.gif|<i>What it looks like optimizing a high-scale app in production</i>|true %}  It's always helpful to check what "order of magnitude" we're at as far as scale. Here are my rules of thumb:

| Requests per minute | Scale |
| -------- | -------- |
| < 10 | Tiny. Should only have 1 server or dyno. |
| 10 - 1000 | Average |
| > 1000 | High. "Just add more servers" may not work anymore. |

Apps above 1000 RPM may start running into scaling issues *outside* of the application in external services, such as databases or cache stores. When I see scale like that, I know my job just got a lot harder because the surface area of potential problems just got bigger.

## Transactions

{% marginnote_lazy https://i.imgur.com/SQItcqT.jpg|<i>Note that the top 3 transactions account for 2/3 of time consumed</i> %} Now that I've gotten the lay of the land, I'll start digging into the specifics. We know the averages, but what about the details? At this stage, I'm looking for my "top 5 worst offenders" - where does the app slow to a crawl? What's the 80/20 of time consumed in this application - in other words, in what actions does this application spend 80% of its time?

Most Ruby applications will spend 80% of their time in just 20% of the application's controllers (or code). This is good for us performance tweakers - rather than trying to optimize across an entire codebase, we can concentrate on just the top 5 or 10 slowest transactions.

For this reason, in the transactions tab, I almost always sort by *most time consuming*. If the top 5 actions in this tab consume 50% of the server's time (they almost always do), and we speed them up by 2x, we've effectively scaled the application up by 25%! That's free scale.

Alternatively, if an application is on the lower end of the requests-per-minute scale, I might sort by slowest average response time instead. This sort also helps if you're concentrating on squashing 95th percentiles.

## Database

{% marginnote_lazy https://i.imgur.com/Ipd76lV.png %} I'm carrying that "worst offender" mindset into the database. Now, if the previous steps have shown that the database isn't a problem, I may glaze over this section or just try and make sure it's not a single query that's taking up all of our database time. Again, "most time consuming" is probably the best sort here.

Here's some symptoms you might see here:

* **Lots of time in #find** If your top SQL queries are all model lookups, you've probably got a bad query somewhere. Pay attention to the "time consumption by caller" graph on the right - where is this query being called the most? Go check out those controllers and see if you're doing a WHERE on a column that hasn't been properly indexed, or if you've accidentally added an N+1 query.
* **SQL - OTHER** You may see this one if you've got a Rails app. Rails periodically issues queries just to check if the database connection is active, and those queries show up under this "OTHER" label. Don't worry about them - there isn't really anything you can do about it.

## External Services

{% marginnote_lazy https://i.imgur.com/2oiZrCk.png %} What I'm looking for here is to make sure that there aren't any external services being pinged during a request. Sometimes that's inevitable (payment processing) but usually it isn't necessary.

Most Ruby applications will block on network requests. For example, if to render my cool page, my controller action tries to request something from the Twitter API (say I grab a list of tweets), the end user has to wait until the Twitter API responds before the application server even returns a response. This can delay page loading by 200-500ms *on average*, with 95th percentile times reaching 20 seconds or more, depending on what your timeouts are set at.

For example, what I can tell from this graph is that Mailchimp (purple spikes in the graph to the right) seems to go down a lot. Wherever I can, I need to make sure that my calls to Mailchimp have an aggressive timeout (something like 5 seconds is reasonable). I may even consider coding up a [Circuit Breaker](http://martinfowler.com/bliki/CircuitBreaker.html). If my app tries to contact Mailchimp a certain number of times and times out, the circuit breaker will trip and stop any future requests before they've even started.

## GC stats and Reports

To be honest, I don't find New Relic's statistics here very useful. You're better off with a tool like `rack-mini-profiler` and `memory_profiler`. I don't find New Relic's "average memory usage per instance" graph very accurate for threaded or multi-process setups either.

If you're having issues with garbage collection, I recommend debugging that in development rather than trying to use New Relic's tools to do it in production. [Here's an excellent article](https://blog.codeship.com/debugging-a-memory-leak-on-heroku/) by Heroku's Richard Schneeman about how to debug memory leaks in Ruby applications.

In addition, I'm not going to cover the Reports, as they're part of New Relic's (rather expensive) paid plans. For what it's worth, they're pretty self-explanatory.

## Browser / Real user monitoring (RUM)

{% marginnote_lazy https://i.imgur.com/UyLFqvw.png %} Remember how we applied an 80/20 mindset to the top offenders in the web transactions tab? We want to do the same thing here. Change the timescale on the main graph to the longest available.   Instead of the percentile graph (which is the default view), change it to the "Browser page load time" graph that breaks average load time down by its components.

* **Request queueing** Same as the web graph. Notice how little of an impact it usually has on a typical Ruby app - most queueing times are something like 10-20ms, which is just a minuscule part of the average 5 second page load.
* **Web application** This is the entire time taken by your app to process a request. Also notice how little time this takes out of the entire stack required to render a webpage.
* **Network** Latency. For most Ruby applications, average latency will be longer than the amount of time spent queuing and responding! This number includes the latency in both directions - to and from your server.
* **DOM Processing** This is usually the bulk of the time in your  graph. DOM Processing in New Relic-land is the time between your client receiving the full response and the [`DOMContentReady` event](https://developer.mozilla.org/en-US/docs/Web/Events/DOMContentLoaded) firing. Now, this is *just* the client having loaded and parsed the *document*, not the CSS and Javascript. *However*, this event is usually delayed while synchronous Javascript executes. WTF is synchronous Javascript? Pretty much anything without an `async` tag. [For more about getting rid of that, check out Google](https://developers.google.com/speed/docs/insights/BlockingJS). In addition, `DOMContentReady` usually also gets [slowed down by external CSS](https://developers.google.com/speed/docs/insights/OptimizeCSSDelivery). Note that, in most browsers, the page pretty much still looks like a blank white window at this point.
* **Page Rendering** Page Rendering, according to NewRelic, is everything that happens between the `DOMContentReady` event and the [`load` event](https://developer.mozilla.org/en-US/docs/Web/Events/load). `load` won't fire until every image, script, and iframe is fully ready. So, the browser *may* have started displaying at least parts of the page before this is finished. Note also that `load` always fires *after* [`DOMContentLoaded`](https://developer.mozilla.org/en-US/docs/Web/Events/DOMContentLoaded), the event that you usually attach most of your Javascript to (JQuery's `$(document).ready` attaches functions to fire after `DOMContentLoaded`, for example).

For a full guide to optimizing front-end performance issues you find here, see my extensive guide on the topic.

It's important to note that while most users won't see *anything* of your site until at least DOM Processing has finished, they probably will start seeing *parts* of it during Page Rendering. It's impossible to know just how much of it they see. If your site has a ton of images, for example, Page Rendering might take *ages* as it downloads all of the images on the page.

Note also that Turbolinks and single-page Javascript apps pretty much break real-user-monitoring, because all of these events (DOMContentLoaded, DOMContentReady, load) will only fire *once*, when the page is initially loaded. New Relic *does* give you additional information on AJAX calls, such as throughput and response time, if you pay for the Pro version of the Browser product.

## Conclusion

NewRelic, and other production performance monitoring tools like it, is an invaluable tool for the performance-minded Rubyist. You simply cannot be serious about speed and not have a production profiling solution installed.

As a takeaway, I hope you've learned how to apply an 80/20 mindset to your Ruby application. This mindset can be applied at all levels of the stack, but don't forget - profiling that isn't based on what the end-user experience isn't based in reality. That's why, for a browser-based application, we should be paying attention first to our *browser* experience, not to our backend, even if that's sometimes easier to measure.
