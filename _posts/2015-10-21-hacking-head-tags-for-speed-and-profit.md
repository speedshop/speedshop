---
layout: post
title:  "Hacking Your Webpage's Head Tags for Speed and Profit"
date:   2015-10-21 7:00:00
summary: One of the most important parts of any webpage's performance is the content and organization of the head element. We'll take a deep dive on some easy optimizations that can be applied to any site.
readtime: 2754 words/13 minutes
wordcount: 2754
---

{% marginnote_lazy https://i.imgur.com/2K3eIZI.gif|<i>\"What's that? The site takes 15 seconds to load on mobile? <br>Sorry, but Marketing says I gotta put Mixpanel in here first.\"</i>|true %} Most of us developers settle for page load times somewhere between 3 and 7 seconds. We open up the graph in NewRelic or [webpagetest.org](http://webpagetest.org), sigh, and then go back to implementing that new feature that the marketing people *absolutely must have deployed yesterday*.

Little do we realize, perceived front-end load times closer to half a second are possible for most (if not all) websites with very little effort.

Most webpages have slow frontend load times not because they're heavy (north of 1MB), or because they need 200kb of Javascript just to render a "Hello World!" (*cough Ember cough*). It isn't because the pipes are too small either - bandwidth is really more than sufficient for the Web today.

**HTML, TCP and latency are the problems, not bandwidth**. Page weight, while important, is a false idol.

A 1MB webpage, with all of it's scripts and CSS inlined, will load faster than 1 MB webpage with 100 different asset requests spread across 10 domains. Each of these asset requests requires a TCP connection, and setting up those connections takes longer when there's more network latency. This is really TCP's fault - it was designed for long, streaming downloads, not the machine-gun fire of 3rd-party Javascript and assets that most websites today require. God forbid you're in a high-latency environment too, like a mobile connection or a developing country. When latency starts to shoot north of 100 milliseconds, webpages grind to a halt trying to set up dozens of [three-way handshakes](https://support.microsoft.com/en-us/kb/172983) to download all of the cat gifs your social media intern said would *totally blow up* this blog post on Reddit.

In addition, some quirks in how HTML works means that certain subresources {% sidenote 1 "Sub-resource is a fancy word for another the HTML document needs - images, stylesheets, fonts, scripts, video and audio are all subresources." %} *must* block page rendering - leaving the browser idling, waiting for things to download and execute. Preventing (and dealing with) the various types of blocking that can happen during a webpage load presents a major performance opportunity. The problem of webpage loading is generally not a problem of resources, it's a problem of using those resources efficiently so that they don't block each other's execution.

Thankfully, **humans are squishy, and perceived load times are not the same as window load times**. We can hack our user's perceptions to make them *think* the webpage loaded faster than it did. `window.load`, while a good starter metric for measuring page load speed, is not a realistic interpretation of how users look at webpages. Humans (unlike computers) can begin to understand the webpage before it's even finished completely loading. This means that *time to paint*, not *time to load* is important. In addition, *time to paint the page's usable content* is of course the most important thing. Gmail quickly paints a loading bar, sure, but you didn't come to Gmail to see the loading bar. You came to see the application. Likewise, if our news website paints some divs to the page but doesn't actually show any text until 2 seconds later because the web fonts took forever to load, then the site wasn't really usable until that text was painted. Thankfully, it's easier to decrease *perceived* load times than it is to decrease *total* load time (as measured by `window.load`). {% marginnote_lazy https://i.imgur.com/I8Zmwht.jpg %} Amazon, for example, paints a nearly complete page just 1.5 seconds after a request is sent, but `window.load` doesn't fire until 3.5 seconds later.

We can leverage human perception to disproportionately affect perceived load times with minimal effort. And the place these opportunities can be exploited is in a site's `head` tag.

The `head` tag is probably the most important part of any webpage from a performance standpoint. It can truly make or break a speedy page - two identical head tags with different element ordering can have speed differences on an order of magnitude, especially in poor network conditions (like mobile or the developing world). But sometimes optimizing head tags can be confusing - there's a lot to understand and browser technology changes rapidly, meaning yesterday's advice can be out of date.

In this article, I'll attempt to show what the optimal head tag looks like - what elements in contains, in what order, and with what special attributes (such as `async` and `defer`) that will lead to zippy-quick load times.

First, some definitions. What *exactly* are we going to optimize for?

When thinking about page load optimization, there are usually three important times for the end user:

* **First paint** - When does the page first start painting to the screen? This doesn't have to be *all* the content - frequently it looks like just a few colored `div` blocks with no text in them (waiting for the fonts to load). Images are usually not loaded yet. Heck, we may not even have downloaded the CSS for anything below the fold yet (the initial viewport - more on that later). But this time is still important - it's when a user first sees a reaction to their input. Decreasing time-to-first-paint can be a critical optimization in improving user *perception* of page loads. This is why [Facebook hacks the JPEG algorithm to send a blurred, 200 byte version of cover photos on mobile](https://code.facebook.com/posts/991252547593574). Creating a *perception* of the page loading is just as important as the page *actually* loading.
* **First paint of text content** - Webpages are text-delivery mechanisms. The Web is typography. When does the page start painting text to the screen? As soon as a page's critical text has been painted - before the images have been downloaded or even any decorative elements rendered - the user can begin processing the information on the screen. And not all text content is equal here - painting "Loading..." to the screen doesn't count.{% marginnote_lazy https://i.imgur.com/yYIJraq.gif|<i>Typical user reaction to loading screens.</i>|true %}  A user cannot begin to *do what they came to your website to do* until the text on that page has painted to the screen, making the moment that text appears one of the most important of your website's loading process. This time can often be substantially different than time to first paint, for reasons I'll get into later on. This is a pet theory of mine, and I am not a designer or information architect by trade, so take this all with a grain of salt.
* **The `load` event** - The `load` event is the last major event the browser fires during a webpage load. It signals that the browser has loaded *all* images, stylesheets, and scripts. Usually (though not necessarily) the page is stable by this point and doesn't change. We can say that when `load` has executed, the page is done loading. However, in reality, the two times above are much more important for a user's perception of page loads. [Above-the-fold render time is so Web 2.0](http://www.stevesouders.com/blog/2013/05/13/moving-beyond-window-onload/).

Our optimal `head` tag will try to optimize *all* of these times. It's important to note that often you'll be presented with a tradeoff - you can decrease time to first paint by increasing time to load, and vice versa. I'm going to point out these tradeoffs, but generally I'm going to prefer to decrease time to first text paint.

## Encoding

{% marginnote_lazy http://i.imgur.com/kWudACZ.gif|<i>\"You get used to it. I don't even see the code anymore. All I see is cat gif, BuzzFeed listicle, Facebook status...\"</i>|true" %} Here's an easy optimization to start us off. When a browser downloads your page off the network, it's just a stream of bits and bytes, and the browser doesn't really know what character encoding you used. Before it can read the data, it needs to decide on a character encoding to use to read the document.  99.9% of the time on the web, we do this with UTF-8, but that isn't guaranteed.

The browser has to decide what *character encoding to use*. There's a couple of ways it can do this (fastest first):

* **The `Content-Type` HTTP header** By putting the document's character encoding right in the response headers, you're ensuring that the browser sets the right character encoding before it even tries to parse the document. This is perfect.
* **`meta` tag** This is probably the most common option. For example, [Bootstrap's example page does this](http://getbootstrap.com/getting-started/#template). If you do this, it's important that it's the very first element in the `head`. If the browser starts reading the document with a different encoding (old IE will sometimes use some weird Windows encoding), it has to go back to the beginning and restart.
* **Guessing** If there's no `meta` tag, and no HTTP header, the browser will try to guess, using things like byte ordering characters. Of course, there are obvious compatibility issues there (and only God knows what old IE will guess), but it's also probably the slowest of all the options.

`X-UA-Compatible` is very similar to character encoding - we want as high up in the document as possible because if you specify a value that's different than what the browser is already using to parse the document, you'll restart the rendering process. If you have to specify a X-UA-Compatible value, here's some tips:

* If you're specifying `X-UA-Compatible` and the value is just "IE=edge", [that may be unnecessary](http://stackoverflow.com/questions/26346917/why-use-x-ua-compatible-ie-edge-anymore). Remove it unless a) you think your site will be used on an intranet b) you're not a top-10000 site that might get added to [Microsoft's compatibility list](http://cvlist.ie.microsoft.com/edge/desktop/1432152749/edgecompatviewlist.xml). {% marginnote_lazy https://i.imgur.com/XfG2mTw.gif|<i>Internet Explorer's reaction to IE=edge</i>|true" %}
* If you can, specify `X-UA-Compatible` in an HTTP header, not in the document itself. This is faster for the same reasons as it is for character encoding, above.
* If it has to be in the document, put `X-UA-Compatible` as high up as you can, specifically within the first 4KB of the response. IE10 and above will [speculatively prescan the first 4KB of the document](http://blogs.msdn.com/b/ieinternals/archive/2011/07/18/optimal-html-head-ordering-to-avoid-parser-restarts-redownloads-and-improve-performance.aspx) looking for an `X-UA-Compatible` tag. Putting it lower on the page will cause page rendering to *stop and restart*. Ouch.

## Viewports

Here's another one. If you're going to specify a `viewport` size, do it at the very top of the `head`.

Why?

Browsers translate this:

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

...into this:

```html
<style>
@viewport {
  zoom: 1.0;
  width: device-width;
}
</style>
```

While [the spec for how this works is still unfinished](http://www.w3.org/TR/css-device-adapt/#translation-into-viewport-properties), you can bet that most browsers already implement it this way.

There's a problem with this - if you put the `viewport` meta tag *after* your stylesheets, you will cause [a layout reflow](https://developers.google.com/speed/articles/reflow?hl=en) for the entire document, slowing down rendering. Don't do that. Keep your viewport tags at the top, right after your character encoding. In addition, putting a viewport tag at the bottom of the head will almost certainly cause a "flash of unstyled content" as the CSS is first loaded in the default viewport, then re-rendered in your specified viewport.

## Concatenation of Assets

TCP isn't really designed for short bursts. It's got a load of overhead, and needs a lot of back-and-forth just to set up a connection.

{% marginnote_lazy https://i.imgur.com/CrC5D2x.gif||true %} Despite this, the top 1000 websites in the world *on average* require 31-40 TCP connections. I'm sure all of them are important, and aren't [advertisements](https://www.google.com/adwords/), [creepy 3rd-party trackers](http://www.mediamath.com/), or [bloatware](https://jquery.com/)! Surely, all of those requests are for absolutely necessary subresources and not a single one could be eliminated.

Alright, jokes aside, here's the scoop. Opening a new TCP connection is slow - it's especially slow if you're asking for content from a different domain (you might need to resolve DNS, negotiate TLS, and more). Minimize new connections where you can. One of the easiest places to do this is by concatenating your assets.

Although the Rails asset pipeline has been a constant source of headache for beginner Rails developers, it is absolutely one of the best performance optimizations that the framework provides.

Concatenate all of your site's stylesheets and scripts into one file each. It's 2015. There's no excuse. {% sidenote 2 "Yes, I know all of this will change when HTTP2 becomes widespread. But it isn't yet, and might not be for at least another year or two. If you're living a magical fairy land where you already get to use HTTP2 in production, go read someone else's guide on that." %}

If you've got a lot of images, it may be time to start thinking about image sprites or an icon font.

All of this can be benchmarked in the wonderful Chrome Network tab - try different configurations and watch the results.

## Async Defer

I'm a Ruby guy, but I hear those Javascript people talking about "async" stuff a lot. It seems like the cool thing these days - everything is "asynchronous" and "non-blocking"! But I live in Ruby land, and most things in our applications are synchronous and blocking. Gee, thanks GIL.

Ordinarily, script tags with an external `src` attribute (that is, not inlined) are synchronous and blocking too.

```html
<script type="text/javascript" src="//some.shitty.thirdpartymarketingsite.com/craptracker.js"></script>
```

When this tag is in the head, the browser *cannot proceed with rendering the page* until it has *downloaded* and *executed* the script. This can be very slow, and even if it isn't, if you do it 6-12 times on one page it will be slow anyway (thanks TCP!). [Here's an example you can test in your own browser](http://stevesouders.com/cuzillion/?c0=hc1hfff2_0_f&c1=hj1hfff2_0_f&c2=bi1hfff2_0_f&c3=bi1hfff2_0_f&c4=bi1hfff2_0_f&t=1445441057). Ouch, right? {% sidenote 3 "While the browser cannot proceed with rendering the page (and therefore painting anything to the screen) until it's finished executing the script, it CAN download other resources further on in the document. This is accomplished with the browser preloader, something I'll get in to next week." %}

You may be thinking this is rather ridiculous - why should a browser stop completely when it sees an external script tag? Well, thanks to The Power of Javascript, that external script tag *could* potentially wreak havoc on the document if it wanted. Heck, it could completely erase the entire document and start over with `document.write()`. The browser just doesn't know. So rather than keep moving, it has to wait, download, and execute. {% sidenote 4 "<a href='http://www.w3.org/TR/html5/scripting-1.html#scripting-1'>All in the HTML spec.</a>" %}

However, in the world of front-end performance, I'm not so restricted! This is not the only way! There's an `async` attribute that can be added to any `script` tag, like so:

```html
<script type="text/javascript" async src="//some.shitty.thirdpartymarketingsite.com/craptracker.js"></script>
```

And *bam!* instantly that entire Javascript file is made _**magically asynchronous**_ right?

Well, no.

The `async` tag just tells the browser that this particular script *isn't required to render the page*. This is perfect for most 3rd-party marketing scripts, like Google Analytics or Gaug.es. In addition, if you're really good (and you're not a Javascript single-page-app), you may be able to make every single external script on your page `async`.

`async` downloads the script file without stoppping parsing of the document - the script tag is no longer *synchronous* with the

There's also this `defer` attribute, which has slightly different effects. What you need to know is that Internet Explorer 9 and below doesn't support `async`, but it does support `defer`, which provides a similar functionality. It never hurts to just add the `defer` attribute after `async`, like so:

```html
<script type="text/javascript" async defer src="//some.shitty.thirdpartymarketingsite.com/craptracker.js"></script>
```

That way IE9 and below will use `defer`, and everyone who's using a browser from after the Cold War will use `async`.

[Here's a great visual explanation of the differences between async and defer](http://www.growingwiththeweb.com/2014/02/async-vs-defer-attributes.html).

So **add `async defer` to every script tag that isn't required for the page to render**. {% sidenote 5 "The caveat is that there's no guarantee as to the order that these scripts will be evaluated in when using async, or even when they'll be evaluated. Even defer, which is *supposed* to execute scripts in order, sometimes won't (bugs, yay). Async is hard." %}

## Stylesheets first

You may have a few non-`async` script tags remaining at this point. Webfont loaders, like Typekit, are a common one - we need fonts to render the page. Some *really* intense marketing JS, like Optimizely, should probably be loaded before the page renders to avoid any flashes of unstyled content as well.

**Put any CSS before these blocking script tags.**

```html
   <head>
     <link rel="stylesheet" media="screen" href="assets/application.css">
     <script src="//use.typekit.net/abcde.js" type="text/javascript"></script>
```

There's no `async` for stylesheets. This makes sense - we need stylesheets to render the page. But if we put CSS (external or inlined) after an external, blocking script, the browser can't use it to render the page until that external script has been downloaded and executed.

This may cause flashes of unstyled content. The most common case is the one I gave above - web fonts. A great way to manage this is with CSS classes. While loading web fonts with Javascript, TypeKit (and many other font loaders) apply a CSS class to the body called `wf-loading`. When the fonts are done loading, it changes to `wf-active`. So with CSS rules like the below, we can hide the text on the page until we've finished loading fonts:

```css
.wf-loading p {
  visibility: hidden
}
```

While text is the most important part of a webpage, it's better to show some of the page (content blocks, images, background styles) than none of it (which is what happens when your external scripts come before your CSS).

## Conclusion

To wrap up my recommendations from this article:

* Specify content encoding with HTTP headers were possible, otherwise do it with meta tags at the *very top* of the document.
* If using `X-UA-Compatible`, put that as far up in the document as possible.
* `<meta name="viewport" ...>` tags should go right below any encoding tags.
* Concatenate your assets.
* `async defer` all the script tags.
* Stylesheets before blocking (non-`async`) scripts.

Next week, I'll be covering even more ways to speed up page loads by optimizing your head tag. We'll cover browser preloaders, HTTP caching, resource hints, streaming responses, and < 4KB headers.
