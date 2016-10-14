---
layout: post
title:  "Page Weight Doesn't Matter"
date:   2015-11-05 7:00:00
categories:
  - performance
summary: "The total size of a webpage, measured in bytes, has little to do with
its load time. Instead, increase network utilization: make your site preloader-friendly, minimize parser blocking, and start downloading resources ASAP with Resource Hints."
readtime: 4697 words/23 minutes
---

There's one universal law of front-end performance - **less is more**. Simple pages are fast pages. We all know this - it isn't controversial. Complexity is the enemy.

And yet, it's trivial to find a website whose complexity seems to reach astronomical levels. {% sidenote 1 "Literally. The Apollo Guidance Computer had just 64 KB of ROM, but most webpages require more than 1MB of data to render. There are some webpages that are actually 100x as complex as the software that took us to the moon." %} It's perhaps telling that media and news sites tend to be the worst here - most media sites in 2015 take ages to load, not to mention all the time you spend clicking past their paywall popups (NYTimes) or full-page advertisements (Forbes).

{% marginnote_lazy https://i.imgur.com/lnAzS1o.jpg|<i>"Dear Adobe: Flash is a dumpster fire. Love, Steve."</i> %} Remember when [Steve Jobs said Apple's mobile products would never support Flash?](http://www.apple.com/hotnews/thoughts-on-flash/) For a year or two there, it was a bit of a golden age in web performance - broadband was becoming widespread, 4G started to come on the scene, and, most importantly, websites started dropping Flash cruft. The "loading!" screens and unnecessarily complicated navigation schemes became something of yesteryear.

That, is, until the marketing department figured out how to use Javascript. The Guardian's homepage sets advertising tracking cookies across 4 different partner domains. Business Insider thought to one-up their neighbors across the pond and sets **cookies across 17 domains**, requires **284 requests** (to nearly 100 unique domains) and a **4.9MB download** which took a full *9 seconds* to load on my cable connection, which is a fairly average broadband ~20 megabit pipe. {% marginnote_lazy https://i.imgur.com/L8K5kUM.gif|<i>"They think Business Insider is a news site and not just an ad delivery mechanism? That's rich!"</i>|true %} Business Insider is, ostensibly, a news site. The purpose of the Business Insider is to deliver text content. Why does that require 5 MB of *things which are not text*?

Unfortunately, it seems, the cry of "complexity is the enemy!" is lost on the ones setting the technical agenda. While trying to load every single tracking cookie possible on your users, you've steered them away by making your site slow on *any* reasonable broadband connection, and nearly *impossible* on any mobile connection.

Usually, the boogeyman that gets pointed at is *bandwidth*: users in low-bandwidth areas (3G, developing world) are getting shafted.

{% marginnote_lazy https://i.imgur.com/AU7LLZi.jpg|<br><i>4 divided by 20 isn't 9...</i>|true %}But the math doesn't *quite* work out. Akamai puts the global connection speed average at **3.9 megabits per second**. So wait a second - why does Business Insider take 9 seconds to load on my 20 megabit pipe, when it's only 4.9MB? If I had an average connection, according to Akamai, shouldn't Business Insider load in 2 seconds, tops?

The secret is that "page weight", broadly defined as the simple total file size of a page and all of it's sub-resources (images, CSS, JS, etc), isn't the problem. **Bandwidth is not the problem, and the performance of the web will not improve as broadband access becomes more widespread.**

The problem is latency.

Most of our networking protocols require a lot of round-trips. Each of those round trips  imposes a latency penalty. Latency is governed, at the end of the day, by the speed of light. Which means that latency *isn't going anywhere*.

DNS lookup is, and always will be, expensive.{% sidenote 2 "I'm being facetious, of course. In 10 years, we may have invented some better protocols here. But it's fair to say we have to live with the current reality for at least a decade. Look at how long it's taking us to get on board with IPv6."%}

TCP connections are, and always will be, expensive.

SSL handshakes are, and always will be, expensive. We're going to be doing more of them over the next 10 years. Thanks NSA.

Each of these things requires at least one *network round-trip* - that is, a packet going from your computer, across the network, to someone else's. That will never be faster than the speed of light - and even light takes 30 milliseconds to go from New York to San Francisco and back. {% sidenote 3 "Thanks to the amount of hops a packet has to make across the internet backbone, usually the time is much worse - 2-4x." %} What's worse is that these network round-trips must happen sequentially - we have to know the IP address before we start the three-way handshake for TCP, and we have to establish a TCP connection before we can start to negotiate SSL.

Setting up a typical HTTPS connection can involve *5.5 round-trips*. That's like 165 milliseconds {% sidenote 4 "In the hypothetical NY-to-SF scenario. Usually it's better than this in the US because of CDNs. But 150ms per connection isn't a bad rule of thumb - and on mobile it's much worse, closer to 300." %} per connection *on a really  really good day*.

The smart ones among you may already see the solution - well, Nate, 165 milliseconds per connection isn't a problem! We'll just parallelize the connections! Boom! 100 connections opened in 165 milliseconds!

The problem is that HTML *doesn't work this way by default*. {% marginnote_lazy https://i.imgur.com/mHImMLs.png|<i>Business Insider's network utilization over time - hardly pegged at 100%.</i> %}

We'd like to imagine that the way a webpage loads is this:

1. Browser opens connection to yoursite.com, does DNS/TCP/SSL setup.
2. Browser downloads the document (HTML).
3. As soon as the browser is done downloading the document, the browser starts downloading all the document's sub resources *at the same time*.
4. Browser parses the document and fills in the necessary sub resources once they've been downloaded.

Here's what actually happens:

1. Browser opens connection to yoursite.com, does DNS/TCP/SSL setup.
2. Browser downloads the document (HTML).
3. Browser starts parsing the document. When the parser encounters a subresource, it opens a connection and downloads it. {% marginnote_lazy https://i.imgur.com/vR44K2h.jpg|<i>Parse the document? Nah man, I'm gonna wait for this script to download and execute.</i>|true %} If the subresource is an external script tag, the parser stops, waits until it the script has downloaded, executes the entire script, and then moves on.
4. As soon as the parser stops and has to wait for an external script to download, it sends ahead something called a *preloader*. The preloader *may* notice and begin downloading resources *if* it understands how to (hint: a very popular Javascript pattern prevents this).

Thanks to these little wrinkles, web page loads often have new connections opening *very* late in a page load - right before the end even! Ideally, the browser would open all of those connections like in our first scenario - immediately after the document is downloaded. We want to maximize network utilization across the life of the webpage load process.

There's four ways to accomplish this:

* **Don't stop the parser.**
* **Get out of the browser preloader's way**.
* **Utilize HTTP caching - but not *too* much**.
* **Use the Resource Hint API**.

## Glossary

I'm going to use a couple of terms here and I want to make sure we're all on the same page.

* Connection - A "connection" is one TCP connection between a client (your browser) and a server. These connections can be re-used across multiple requests through things like [keep-alive](https://en.wikipedia.org/wiki/HTTP_persistent_connection).
* Request - A browser "requests" resources via HTTP. 99% of the time when we're talking about requesting resources, we're talking about an HTTP GET. Each request needs to use a TCP connection, though not necessarily a unique or new one (see [keep-alive](https://en.wikipedia.org/wiki/HTTP_persistent_connection)).
* Subresource - In browser parlance, a subresource is generally any resource required to completely load the main resource (in this case, the document). Examples of subresources include external Javascript (that is, `script` tags with a `src` attribute), external CSS stylesheets, images, favicons, and more.
* Parser - When a browser tries to load your webpage, it uses a parser to read the document and decide what sub resources need to be fetched and to construct the DOM. The parser is responsible for getting the document to one of the first important events during a page load, DOMContentLoaded.

## Letting the Preloader do it's Job

Sometimes the parser has to stop and wait for an external resource to download - 99% of the time, this is an external script. When this happens, the browser starts something called a preloader. The preloader is a bit like a "parser-lite", but rather than construct the DOM, the preloader is more like a giant regex that searches for sub resources to download. If it finds a subresource (say an external script at the end of the document), it will start downloading it *before* the parser gets to it.

You may be thinking this is rather ridiculous - why should a browser stop completely when it sees an external script tag? Well, thanks to The Power of Javascript, that external script tag *could* potentially wreak havoc on the document if it wanted. Heck, it could completely erase the entire document and start over with `document.write()`. The browser just doesn't know. So rather than keep moving, it has to wait, download, and execute. {% sidenote 5 "<a href='http://www.w3.org/TR/html5/scripting-1.html#scripting-1'>All in the HTML spec.</a>" %}

Browser preloaders were a huge innovation in web performance when they arrived on the scene. Completely unoptimized webpages could speed up by 20% or more just thanks to the preloader fetching resources!

That said, there are ways to help the preloader and there are ways to hinder it. We want to help the preloader as much as possible, and sometimes we want to stay the hell out of it's way.

### Stop inserting scripts with "async" script-injection

{% marginnote_lazy https://i.imgur.com/G3DhZwf.gif|<i>It's just one more script tag!</i>|true" %} The marketing department says you need to integrate your site with SomeBozoAdService. They said it's really easy - you just have to "add five lines of code!". You go to SomeBozoAdService's developer section, and find that they tell you to insert this into your document somewhere:

```javascript
var t = document.createElement('script');
t.src = "//somebozoadservice.com/ad-tracker.js";
document.getElementsByTagName('head')[0].appendChild(script);
```

There are other problems with this pattern (it blocks page rendering until it's done, for one), but here's one really important one - browser preloaders can't work with this. Preload scanners are *very* simple - they're simple so that they can be fast. And when they see one of these async-injected scripts, they just give up and move on. So your browser can't download the resource until the main parser thread gets to it. Bummer! It's far better to use `async` and `defer` attributes on your script tags instead, to get this:

```html
<script src="//somebozoadservice.com/ad-tracker.js" async defer></script>
```

Kaboom! There are some other advantages to `async` that I get into in [this other post here](/2015/10/21/hacking-head-tags-for-speed-and-profit.html), but be aware that one of them is that the browser preloader can get started downloading this script before the parser even gets there.

Here's a list of other things that generally don't work with browser preloaders:

* IFrames. Sometimes there's no way around using an iframe, but if you have the option - try not to. The content of the frame can't be loaded until the parser gets there.
* @import. I'm not sure of anyone that uses @import in their production CSS, but don't. Preloaders can't start fetching `@import`ed stylesheets for you.
* {% marginnote_lazy https://i.imgur.com/oL7MkI0.jpg|<i>Design department: \"But we need these 90 fonts to spice up the visual interest of the page!\"</i> %} Webfonts. Here's an interesting one. I could write a whole article on webfont speed (I should/will!), but they usually aren't preloaded. This is fixable with resource hints (we'll get to that in a second).
* HTML5 audio/video. This is also fixable with resource hints.

I've heard that in the past, preloaders wouldn't scan the body tag when blocked in the head. If that was ever true, it is no longer true in Webkit based browsers.

In addition, modern preloaders are smart enough not to request resources that are already cached. Speaking of HTTP caching...

## HTTP caching

The fastest HTTP request is the one that is never made. That's really all HTTP caching is for - preventing unnecessary requests. Cache control headers are really for telling clients "Hey - this resource, it's not going to change very quickly. Don't ask me again for this resource until..." That's awesome. We should do that everywhere possible.

[Yet, the size of the resource cache is smaller than you might think.](http://www.guypo.com/mobile-browser-cache-sizes-round-2/) Here's the default disk cache size in modern browsers:
{% marginnote_lazy https://i.imgur.com/E0yJ6HR.jpg||true %}

| Browser | Cache Size (default) |
| -------- | -------- |
| Internet Explorer 9+ | ~250MB |
| Chrome | 200MB |
| Firefox | 540MB |
| Mobile Safari | 0 |
| Android (all) | ~25-80 MB |

Not as large as you might imagine. And you read that right - Mobile Safari does not have a persistent, on-disk cache.

Most browser resource caches work on an LRU basis - last recently used. So if something doesn't get used in the cache, it's the first thing to be evicted if the cache fills up.

A pattern I've often seen is to use 3rd-party, CDN-hosted copies of popular libraries in an attempt to leverage HTTP caching. The idea is to use Google's copy of JQuery (or what have you), and a prospective user to your site will already have it downloaded before coming to yours. The browser will notice it's already in their cache, and not make a new request. There's some other benefits, but I want to pick on this one.

This sounds good in theory, but given the tiny size of caches, I'm not sure if it really works in practice.  Consider how few sites actually use Google-hosted (or Cloudflare-hosted, or whatever) JQuery. Even if they did - how often is your cached copy pushed *out* of the cache by other resources? Do you know?

Consider the alternative - bundling JQuery into your application's concatenated "application.js" file (Rails' default behavior).

In the best case, the user already has the 3rd-party CDN-hosted JQuery downloaded and cached. The request to go and get your application.js doesn't take *quite* as long because it's ~20kb smaller now that it doesn't include JQuery. But remember what we said above - bandwidth is hardly the issue for most connections (saving 20kb is really saving <100ms, even on a 2MB/s DSL connection).

But consider the worst case scenario - the user doesn't have our 3rd-party JS downloaded already. Now, compared to the "stock" application.js scenario, you have to make an additional new connection to a new domain, likely requiring SSL/TLS negotiation. Without even downloading the script, you've been hit with 1-300ms of network latency. Bummer.

Consider how much worse this gets when you're including more than 1 library from an external CDN. God forbid that the script tags aren't `async`, or your user will be sitting there for a while.

In conclusion, 3rd-party hosted Javascript, while a good idea and, strictly speaking, faster in the best-case scenario, is likely to impose a huge performance penalty to users that don't have every single one of your 3rd-party scripts cached already. Far preferable is to bundle it into a single "application.js" file, served from your own domain. That way, we can re-use the already warm connection (as long you allowed the browser to "keep-alive" the connection it used to download the document) to download all of your external Javascript in one go.

## Resource hints

There's another way we can maximize network utilization - through something called *resource hints*. There are couple of different kinds of resource hints. In general, most of them are telling the browser to *prepare some connection or resource in advance* of the parser getting to the actual point where it needs the connection. This prevents the parser from blocking on the network.

* **DNS Prefetch** - Pretty simple - tell the browser to resolve the DNS of a given hostname (`example.com`) as soon as possible.
* **Preconnect** - Tells the browser to open a connection as soon as possible to a given hostname. Not only will this resolve DNS, it will start a TCP handshake and perform TLS negotiation if the connection is SSL.
* **Prefetch** - Tells to browser to download an entire resource (or subresource) that may be required later on. This resource can be an entire HTML document (for example, the next page of search results), or it can be a script, stylesheet, or other subresource. The resource is only downloaded - it isn't parsed (if script) or rendered (if HTML).
* **Prerender** - One of these things is not like the other, and prerender is it. Marking an `<a>` tag with `prerender` will actually cause the browser to get the linked `href` page and *render it before the user even clicks the anchor!* This is the technology behind Google's Instant Pages and Facebook's Instant Articles.

It's important to note that all of these are *hints*. The browser may or may not act upon them. Most of the time, though, they will - and we can use this to our advantage.

**Browser support**: I've detailed which browsers support which resource hints (as of November 2015) below. However, any user agent that doesn't understand a particular hint will just skip past it, so there's no harm in including them. Most resource hints enjoy >50% worldwide support (according to to [caniuse.com](http://www.caniuse.com)) so I think they're definitely worth including on any page.

Let's talk about each of these items in turn, and when or why you might use each of them:

## DNS Prefetch

```html
<link rel="dns-prefetch" href="//example.com">
```

In case you're brand new to networking, here's a review - computers don't network in terms of domain names. Instead, they use IP addresses (like `192.168.1.1`, etc). They *resolve* a hostname, like `example.com`, into an IP address. To do this, they have to go to a DNS server (for example, Google's server at `8.8.8.8`) and ask: "Hey, what's the IP address of `some-host.com`?" This connection takes time - usually somewhere between 50-100ms, although it can take much longer on mobile networks or in developing countries (500-750ms).

**When to Use It:** {% marginnote_lazy https://i.imgur.com/iTlcW8x.gif|<i>\"Stop trying to make dns-prefetch a thing!\"</i>|true %}  But you may be asking - why would I ever want to resolve the DNS for a hostname and *not actually connect to that hostname*? Exactly. So forget about `dns-prefetch`, because it's cousin, `preconnect`, does exactly that.

**Browser Support**: Everything except IE 9 and below.

## Preconnect

```html
<link rel="preconnect" href="//example.com">
```

A preconnect resource hint will hint the browser to do the following:

* Resolve the DNS, if not done already (1 round-trip)
* Open a TCP connection ([1.5 round-trips](https://blog.packet-foo.com/2014/07/determining-tcp-initial-round-trip-time/))
* Complete a TLS handshake if the connection is HTTPS ([2-3 round-trips](https://zoompf.com/blog/2014/12/optimizing-tls-handshake))

The only thing it won't do is actually download the (sub)resource - the browser won't start loading the resource until either the parser or preloader tries to download the resource. This can eliminate up to 5 round-trips across the network! That can save us a heck of a lot of time in most environments, even fast home Wifi connections.

**When to Use It:** Here's an example from [Rubygems.org](https://rubygems.org).

Taking a look at how Rubygems.org loads in [webpagetest.org](webpagetest.org), we notice a few things. What we're looking for is network utilization after the document is downloaded - once the main "/" document loads, we should see a bunch of network requests fire at once. Ideally, they'd all fire off at this point. In a perfect world, network utilization would look like a flat line at 100%, which then stops as soon as the page loads completely. Preconnect helps us to do that by allowing us to move some network tasks earlier in the page load process.

Notice these these two resources, closer to the end of the page load:

<img src="https://i.imgur.com/Gzb1AQg.jpg">

Two are related to gaug.es, an analytics tracking service, and the other is a GIF from a Typekit domain. The green bar here is time-to-first-byte - time spent waiting for a server response. But note how the analytics tracking service and the Typekit GIF have teal, orange, and purple bars as well - these bars represent time spent resolving DNS, opening a connection, and negotiating SSL, respectively. By adding a preconnect tag to the head of the document, we can move this work to the beginning of the page load, so that when the browser needs to download these resource it has a pre-warmed connection. That loads each resource ~200ms faster in this case.

You may be wondering - why hasn't the preloader started loading these resources earlier? In the case of the gang.es script, it was loaded with an "async" script-injection tag. This is why that method is a bit of a stinker. For more about why script-injection isn't a great idea, see Ilya Grigorik's post on the topic. So in this case, rather than adding a `preconnect` tag, I'll simply change the gaug.es script to a regular script tag with an `async` attribute. That way, the browser preloader will pick it up and download it as soon as possible.

In the case of that Typekit gif, it was also script-injected into the bottom of the document. A `preconnect` tag would speed up this connection. However, `p.gif` is [actually a tracking beacon for Adobe](https://www.leaseweb.com/labs/2015/03/ghostery-blocks-adobe-typekit-hosted-fonts/), so I don't think that speeding that up will provide any performance benefit to the user.

In general, `preconnect` works best with sub resources that are script-injected, because the browser preloader cannot download these resources. Use webpagetest.org to seek out sub resources that load late and trigger the DNS/TCP/TLS setup cost.

In addition, it works very well for script-injected resources with dynamic URLs. You can set up a connection to the domain, and then later use that connection to download a dynamic resource (like the Typekit example above). See the W3C spec:

> The full resource URL may not be known until the page is being constructed by the user agent - e.g. conditional loading logic, UA adaptation, etc. However, the origin from which one or more of these resources will be fetched is often known ahead of time by the developer or the server generating the response. In such cases, a preconnect hint can be used to initiate an early connection handshake such that when the resource URL is determined, the user agent can dispatch the request without first blocking on connection negotiation.

**Browser Support**: Unfortunately, preconnect is probably the least-supported resource hint. It only works in *very* modern Chrome and Firefox versions, and is coming to Opera soon. Safari and IE don't support it.

## Prefetch

```html
<link rel="prefetch" href="//example.com/some-image.gif">
```

{% marginnote_lazy https://i.imgur.com/gQq7Lru.gif|<i>Go get the resource, Chrome! Go get it, boy!</i>|true %} A prefetch resource hint will hint the browser to do the following:

* Everything that we did to set up a connection in the `preconnect` hint (DNS/TCP/TLS).
* But in addition, the browser will also *actually download the resource*.
* However, `prefetch` only works for resources required by *the next navigation*, not for the *current page*.

**When to Use It:** Consider using `prefetch` in any case where you have a good idea what the user might do next. For example, if we were implementing an image gallery with Javascript, where each image was loaded with an AJAX request, we might insert the following prefetch tag to load the next image in the gallery:

```html
<link rel="prefetch" href="//example.com/gallery-image-2.jpg">
```

You can even prefetch entire pages. Consider a paginated search result:

```html
<link rel="prefetch" href="//example.com/search?q=test&page=2">
```

**Browser Support**: IE 11 and up, Firefox, Chrome, and Opera all support `prefetch`. Safari and iOS Safari don't.

## Prerender

Prerender is prefetch on steroids - instead of just downloading the linked document, it will actually pre-render the entire page! Obviously, this means that pre rendering only works for HTML documents, not scripts or other subresources.

This is a great way to implement something like Google's Instant Pages or Facebook's Instant Articles.

Of course, you have to be careful and considerate when using prefetch and prerender. If you're prefetching something on your own server, you're effectively adding another request to your server load for every prefetch directive. A prerender directive can be even more load-intensive because the browser will also fetch all sub resources (CSS/JS/images, etc), which may also come from your servers. It's important to only use prerender and prefetch where you can be pretty certain a user will actually use those resources on the next navigation.

There's another caveat to prerender - like all resource hints, pretenders are given much lower priority by the browser and aren't always executed. [Here's straight from the spec](http://www.w3.org/TR/resource-hints/#speculative-resource-prefetching-prefetch):

"The user agent may:
* Allocate fewer CPU, GPU, or memory resources to pre rendered content.
* Delay some requests until the requested HTML resource is made visible - e.g. media downloads, plugin content, and so on.
* Prevent pre rendering from being initiated when there are limited resources available."

**Browser Support**: IE 11 and up, Chrome, and Opera. Firefox, Safari and iOS Safari don't get this one.

## Conclusion

We have a long way to go with performance on the web. I scraped together a little script to check the Alexa Top 10000 sites and look for resource hints - here's a quick table of what I found.

| Resource Hint | Prevalence |
| --------------|------------|
| `dns-prefetch`  | 5.0% |
| `preconnect`    | 0.4% |
| `prefetch`     | 0.4% |
| `prerender`     | 0.1% |

So many sites could benefit from liberal use of some or all of these resource hints, but so few do. Most sites that do use them are just using `dns-prefetch`, which is practically useless when compared to the superior `preconnect` (how often do you really want to know the DNS resolution of a host and then *not* connect to it?).

{% marginnote_lazy https://i.imgur.com/cchNrOn.gif||true %} I'd like to back off from the flamebait-y title off this article *just* slightly. Now that I've explained all of the different things you can do to increase network utilization during a webpage load, know that 100% utilization isn't always possible. Resource hints and the other techniques in this article *help* complex pages load faster, but thanks to many different constraints you may not be able to apply them in all situations. Page weight *does* matter - a 5MB page will be more difficult to optimize than a 500 KB one. What I'm really trying to say is that page weight *only sorta* matters.

I hope I've demonstrated to you that page weight - while certainly *correlated* with webpage load speed, is not the final answer. You shouldn't feel like your page is doomed to slowness because The Marketing People need you to include 8 different external ad tracking services (although you should consider quitting your job if that's the case).

**TL;DR:**

* Don't inject scripts.
* Reduce the number of connections required *before* reducing page size.
* HTTP caching is great, but don't *rely* on any particular resource being cached.
* Use resource hints - especially `preconnect` and `prefetch`.
