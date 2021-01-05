---
layout: post
title:  "How To Use Turbolinks to Make Fast Rails Apps"
date:   2021-01-04 12:00:00
summary: Is Rails dead? Can the old Ruby web framework no longer keep up in this age of "native-like" performance? Turbolinks provides one solution.
readtime: 3030 words/15 minutes
wordcount: 3030
---

A perceived benefit of a client-side JS framework is the responsiveness of its interface - updates to the UI are instantaneous. A large amount of application logic (and, usually, state) lives on the client, instead of on the server. The client-side application can perform most tasks without running back to the server for a round-trip. As a result, in the post-V8 era, many developers think traditional server-side languages and frameworks (Ruby, Python, even Java) are simply too slow for modern web applications, which are now supposed to behave like native applications, with instantaneous responses.

Is Rails dead? Can the old Ruby web framework no longer keep up in this age of "native-like" performance?

Shopify (an e-commerce provider that lets you set up your own online shop) has [over 150,000 customers](http://www.sec.gov/Archives/edgar/data/1594805/000119312515129273/d863202df1.htm) and is a [Top 1000](http://www.alexa.com/siteinfo/shopify.com) site on Alexa.{% marginnote_lazy https://i.imgur.com/F49D9La.png %} In addition, Shopify hosts their customers' sites, with an average of 100ms response times for over 300 million monthly page views. Now that's Web Scale. And they did it all on Rails.

They're not the only ones doing huge deployments with blazing fast response times on Rails. [DHH claims Basecamp's average server response time is 27ms](https://www.youtube.com/watch?v=yhseQP52yIY). [Github averages about 60ms](https://status.github.com/).

But fast response times are only half of the equation. If your server is blazing fast, but you're spending 500-1000ms on each new page load rendering the page, setting up a new Javascript VM, and re-constructing the entire render tree, your application will be fast, but it won't be *instantaneous*.

Enter [Turbolinks](http://github.com/rails/turbolinks).

## Turbolinks and other "view-over-the-wire" technologies

Turbolinks received (and still receives) a huge amount of flak from Rails developers upon its release. Along with [pjax](https://github.com/defunkt/jquery-pjax), from which it evolved, Turbolinks represented a radical shift in the way Rails apps were intended to be architected. Suddenly, Rails apps had similar characteristics to the "Javascript single-page app" paradigm: no full page loads, pushState usage, and AJAX.

But there was a critical difference between Turbolinks and their SPA brethren: instead of sending *data* over the wire, Turbolinks sent *fully rendered views*. Application logic was reclaimed from the client and kept on the server again. Which meant we got to write more Ruby! I'll call this approach "views-over-the-wire", becausing we're sending HTML, not data.

"View-over-the-wire" technologies like turbolinks and pjax have laid mostly out of the limelight since their release in ~2012, despite their usage by such high-profile sites as [Shopify](https://www.shopify.com/technology/15646068-rebuilding-the-shopify-admin-improving-developer-productivity-by-deleting-28-000-lines-of-javascript) and Github. But with Rails 5, Turbolinks is getting a nice upgrade, with new features like partial replacement and a progress bar with a public API. So I wanted to answer for myself the question: how does building an application with Turbolinks feel? Can it be not just fast, but *instantaneous*?

And just what is an instantaneous response? Thankfully, the guidelines for human-computer interaction speeds have remained constant since [they were first discovered in the late 60's](http://theixdlibrary.com/pdf/Miller1968.pdf):

* **0.1 second** is about the limit for having the user feel that the system is reacting instantaneously, meaning that no special feedback is necessary except to display the result.
* **1.0 second** is about the limit for the user's flow of thought to stay uninterrupted, even though the user will notice the delay. Normally, no special feedback is necessary during delays of more than 0.1 but less than 1.0 second, but the user does lose the feeling of operating directly on the data.
* **10 seconds** is about the limit for keeping the user's attention focused on the dialogue. For longer delays, users will want to perform other tasks while waiting for the computer to finish, so they should be given feedback indicating when the computer expects to be done. Feedback during the delay is especially important if the response time is likely to be highly variable, since users will then not know what to expect. {% sidenote 1 "This is the Nielsen Norman group's interpretation of the linked paper. See the rest of their take on response times <a href='http://www.nngroup.com/articles/response-times-3-important-limits/'>here</a>." %}

## Can Turbolinks help us achieve sub-0.1 second interaction?

In the non-Turbolinks world, Rails apps usually live in the 1.0 second realm. They return a response in 100-300ms, spend about 200ms loading the HTML and CSSOM, [a few hundred more ms rendering and painting](https://developers.google.com/web/fundamentals/performance/critical-rendering-path/render-tree-construction?hl=en), and then likely loads of JS scripting tied to the onload event.

But in the Turbolinks/pjax world, we get to cut out a lot of the work that usually happens when accessing a new page. Consider:

1. When using Turbolinks, you don't throw away your entire Javascript runtime on every page. We don't have to attach a thousand event listeners to the DOM, nor throw out any JS variables between page loads. This requires you to rethink the way you write your Javascript, but the speed benefits are big.
1. When using Turbolinks partial replacement, we don't even throw away the entire DOM, instead changing only the parts we need to change.
1. We don't have to parse and tokenize the CSS and JS ever again - the CSS Object Model is maintained.

All of this translates into eliminating 200-700ms on each new page. This lets us move out of the 1 second human-computer interaction realm, and start to flirt with the 100 ms realm of "instantaneous" interaction.

As an experiment, I've constructed a TodoMVC app using Rails 5 (still under active development) and Turbolinks 3. You can find [the application here](http://todomvc-turbolinks.herokuapp.com/) and [the code here](https://github.com/nateberkopec/todomvc-turbolinks). It also utilizes partial replacement, a new feature in Turbolinks 3. Using your browsers favorite development tools, you can confirm that most interactions in the app take about 100-250ms, from the time the click event is registered until the response is painted to the screen.

By comparison, the reference Backbone implementation for TodoMVC takes about 25-40ms. Consider also that our Backbone implementation isn't making any roundtrips to a server to update data - most TodoMVC implementations use LocalStorage. I can't find a live TodoMVC implementation that uses a javascript framework *and* a server backend, so the comparison will have to suffice. In any case, after removing network timing, Turbolinks takes about the same amount of time to update the page state and paint the new elements about as quickly as Backbone. And we didn't even have to write any new Javascript!

Turbolinks also forces you to do a lot of things you should be doing already with your frontend Javascript - idempotent functions, and not treating your DOM ready hooks like a junk drawer. A lot of people griped about this when Turbolinks came out - but you shouldn't have been doing it anyway!

Other than asking to re-evaluate the way you write your frontend JS, Turbolinks doesn't ask you to change a whole lot about the way you write Rails apps. You still get to use all the tools you're used to on the backend, because what you're doing is still The Web with a little spice thrown in, not [trying to build native applications in Javascript](http://www.quirksmode.org/blog/archives/2015/05/web_vs_native_l.html).


### load is dead, all hail load!

Look in any Rails project, and for better or for worse, you're going to see a lot of this:

```javascript
$(document).ready(function () { ... } );
```

Rails developers are usually pretty lazy when it comes to Javascript (although, most *developers* are pretty lazy). [JQuery waits for DOMContentLoaded to fire](https://github.com/jquery/jquery/blob/master/src/core/ready.js#L81) before handing off execution to the function in `ready`. But Turbolinks takes DOMContentLoaded away from us, and [gives us a couple other events instead](https://github.com/rails/turbolinks#events). Try attaching events to these instead, or using JQuery's `.on` to attach event handlers to the document (as opposed to individual nodes). This removal of the `load` and `DOMContentLoaded` events can wreak havoc on existing Javascript that uses page ready listeners everywhere, and why I wouldn't recommend using Turbolinks on existing projects, and using it for greenfield only.

### Caching - still a Rails dev's best friend

DHH has said it a hundred times: Rails is an extraction from Basecamp, and is best used when building Basecamp-like applications. Thus, DHH's [2013 talk on Basecamp's architecture](https://www.youtube.com/watch?v=yhseQP52yIY) is very valuable - most Rails apps should be architected this way, otherwise you're going to be spending most of your time fighting the framework rather than getting things done.

Most successful large-scale Rails deployments make extensive use of caching. Ruby is a (comparatively) slow language - if you want to keep server response times below 300ms, you simply have to minimize the amount of Ruby you're running on every request and never calculate the same thing twice.

Caching can be a double-edged sword in small apps, though. Sometimes, the amount of time it takes to read from the cache is more than it takes to just render something. When evaluating whether or not to cache something, *always* test your apps locally *in production mode*, with production-size datasets (hopefully just a copy of the production DB, if your company allows it). The only way to know for sure if caching is the right solution for a block of code is to measure, measure, measure. And how do we do that?

### rack-mini-profiler and the flamegraph

[rack-mini-profiler](https://github.com/MiniProfiler/rack-mini-profiler) {% marginnote_lazy https://i.imgur.com/1J1hlPt.png %} has become an indispensable part of my Ruby workflow. It's written by the incredible Sam Saffron, who's doing absolutely vital work (along with others) on Ruby speed over at  [RubyBench.org](https://rubybench.org).

rack-mini-profiler puts a little white box at the upper left of a page, showing you exactly how long the last request took to process, along with a breakdown of how many SQL queries were executed. The amount of unnecessary SQL queries I've eliminated with this tool must number in the thousands.

But that's not even rack-mini-profiler's killer feature. If you add in the `flamegraph` gem to your Gemfile, you get a killer flame graph showing exactly how long rendering each part of your page took. This is invaluable when tracking down exactly what parts of the page took the most time to render.

### Chrome Timeline - the sub-100ms developer's best friend

When you're aiming for a sub-100ms-to-glass Turbolinks app, every ms counts. So allow me introduce you to my little friend: the Chrome Timeline.{% marginnote_lazy https://i.imgur.com/izy57wD.png %}

This bad boy shows you, in flamegraph format, exactly where each of your 100ms goes. Read up on Google's documentation on exactly how to use this tool, and exactly what means what, but it'll give you a great idea of which parts of your Javascript are slowing down your page.

### Non-RESTful redirects

100ms-to-glass is *not* a lot of time. In most cases, you may not even have time to redirect. Consider this typical bit of Rails controller logic:

```ruby
def create
  thing = Thing.new(params[:thing])
  if thing.save
    redirect_to #...
```

Unfortunately, you've just doubled the number of round-trips to the server - one for the POST, and one for the GET when you get your response back from the redirect. I've found that this alone puts you beyond 100ms. With remote forms and Turbolinks, it seems to be far better to do non-RESTFUL responses here and [just re-render the (updated) index view](https://github.com/nateberkopec/todomvc-turbolinks/blob/master/app/controllers/todos_controller.rb#L8).

### Be wary of partials

Partials in Rails have always been slow-ish. They're fast enough if you're aiming for 300ms responses, but in the 100ms-to-glass world, we can't really afford any less than a 50ms server response time. Be wary of using partials, cache them if you can, and always benchmark when adding a new partial.

### Response time goals and Apache Bench

Another key tool for keeping your Turbolinks-enabled Rails app below 100ms-to-glass is to keep your server response times ridiculously fast - 50ms should be your goal. Apache Bench{% marginnote_lazy https://i.imgur.com/nsSgaBj.png %} is a great tool for doing this, but siege is another popular tool that does the same thing - slams your web server as fast as it can to get an idea of your max requests/second.

Be sure to load up your rails server in production mode when benchmarking with these tools so that you don't have code reloading slowing down each request!

In addition, be sure to test with production (or extremely production-like) data. If queries return 100 rows in development but return 1000 rows in production, you're going to see very different performance. We want our development environment to be as similar to production as possible.

### Common mistakes

* **Be absolutely certain that a page load that you *think* is Turbolinks enabled, is actually Turbolinks enabled.** Click a link with the Developer console open - if the console says something like "Navigated to http://www.whatever.com/foo", that link wasn't Turbolinks-enabled.
* **Don't render responses that do things like append items to the current page.** Instead, a Turbolinks-enabled action should return a full HTML page. Let Turbolinks do the work of swapping out the document, instead of writing your own, manual "$("#todo-list").append("<%= j(render(@todo)) %>");" calls. For an example, [check out my TodoMVC implementation](https://github.com/nateberkopec/todomvc-turbolinks/blob/master/app/views/todos/index.html.erb), which only uses an index template. Keep state (elements having certain classes, for example) in the template, rather than allowing too much DOM state to leak into your Javascript. It's just unnecessary work that Turbolinks frees us from doing.

### Limitations and caveats

Turbolinks may not fare well in more complex UI interactions - the TodoMVC example is very simple. Caching *will* be required when scaling, which some people think is too complex. I think that with smart key-based expiration, and completely avoiding manual cache expiration or "sweepers", it isn't too bad.

Turbolinks doesn't play great with client side JS frameworks, due to the transition cache and the lack of the `load` event. Be wary of multiple instances of your app being generated, and be careful of Turbolinks' transition cache.

Integration testing is still a pain. Capybara and selenium-webdriver, though widely used, remain difficult to configure properly and, seemingly no matter what, are not deterministic and occasionally experience random failures.

### Conclusion: "View-over-the-wire" is better than it got credit for

Overall, I quite enjoyed the Turbolinks development experience, and mostly, as a user, I'm extremely impressed with the user experience it produces. Getting serious about Rails performance and using a "view-over-the-wire" technology means that Rails apps will deliver top-shelf experiences on par with any clientside framework.

UPdate