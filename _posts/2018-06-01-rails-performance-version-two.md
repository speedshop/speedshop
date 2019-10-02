---
layout: post
title:  "The Complete Guide to Rails Performance, Version 2"
date:   2018-06-01 7:00:00
summary: "I've completed the 'second edition' of my course, the CGRP. What's changed since I released the course two years ago? Where do I see Rails going in the future?"
readtime: 1288 words/5 minutes
wordcount: 1288
image: cgrp2.jpg
---

Today, the Complete Guide to Rails Performance has been updated to version 2.0. [You can purchase it here](https://www.railsspeed.com).

All existing purchasers have had their copies updated on Gumroad. When I started this project, I always believed that a digital course should be *better* than a typical paperback programming book. That's why I don't include any DRM or proprietary video codecs. That's why I think, like most software, updates should be free.

"Version 2.0" isn't quite as drastic a change as a software v2.0, though. The world of Rails performance has actually changed very little since I wrote the course 2 years ago. The apps I consult on still have many of the same problems. The V2 update reflects this: I have revised the content for clarity, and updated a few places to reflect changes in Ruby 2.5 and Rails 5.2, but it is mostly still the same. I have also added four lessons: memory fragmentation, application server config, GC tuning, and PGBouncer config. These lessons were added based on new problems and thinking I've had since the course was released. Web-Scale Package purchasers will also get a new interview with Noah Gibbs of Appfolio next week.

So, what does it mean that not much has changed in the Rails performance world?

This tweet put me in an introspective mood this morning:

<blockquote class="twitter-tweet" data-lang="en"><p lang="en" dir="ltr">It is profoundly sad how Rails has institutionalized a &quot;nobody cares&quot; attitude toward performance. <a href="https://t.co/UhzvxyLjuz">https://t.co/UhzvxyLjuz</a></p>&mdash; Jeff Atwood (@codinghorror) <a href="https://twitter.com/codinghorror/status/1002448764630470656?ref_src=twsrc%5Etfw">June 1, 2018</a></blockquote>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>

To summarize, Jeff's cofounder, Sam Saffron (who I interviewed for the CGRP), wrote a great, in-depth blog post about memory use in ActiveRecord. In short, Sam finds that ActiveRecord creates excessive amounts of objects, even when doing simple and supposedly "optimized" work. Sam posted a proof-of-concept patch which improves this quite a bit.

Jeff's tweet diminishes the work of many Rails contributors. Aaron Patterson has spent the last two years working on Rails performance and a compacting garbage collector. Richard Schneeman has improved Sprockets' performance a great deal. Sam Saffron himself has contributed over a dozen performance improvements to Rails, which, as far I can tell, have all been accepted. I know also that Andrew White, Eileen Uchitelle, and Rafael Franca are all Rails core members that care deeply about performance (probably because all of them have day-jobs running large Rails applications!). So any idea that Rails' contributors or core members "don't care" about performance is laughingly misguided, and is an opinion that can only really be held by someone outside the community. The way Jeff tried to turn it around in the replies into a "hot take" that people should "get angry" and "punk rock" about the "status quo" just made it more obvious.

It's pretty easy to take potshots at a mature framework like Ruby on Rails. It has almost 13 years of history behind it. There's going to be cruft, baggage, and outdated decisions baked in. That's what happens. But there's also tremendous productivity, something gained from the thousands of contributors who have all contributed their "lessons learned" back to the framework. But if you forget about that history, it's easy to craft a benchmark to make it look like that history has overtaken it's usefulness in the present.

This is the gap I've tried to bridge in my writing and in publishing The Complete Guide to Rails Performance. **I believe that performance problems in Rails are pedagogical, not technical**. It's not because we don't have enough people working on performance (though it helps!). It's not because we don't value it as a community (how many times do I have to cite all of the top 10,000 websites that run Rails at speed?). **It's because Rails (and Ruby) optimizes for programmer happiness, and that means we provide sharp tools which are easy to cut yourself on.** Rather than throw the tools out, I think we need to teach people to use them safely.

ActiveRecord is probably the best example of what I'm talking about. It's an extremely productive tool. It works very well for 80% of web-app use-cases. But every year, someone wants to throw it out and thinks that some other Rubygem or pattern (e.g. DataMapper) will save them. It's so easy to craft a line of code with ActiveRecord that will slow your application to a crawl if you're not thinking through through the consequences, as anyone who has written `User.all.each` can tell you.

There is no One True Pattern or One True Framework. But there is a Thing Which Works For Most People. And if you end up being one of the 20% for whom it doesn't work so well, or the tool's productivity preference means that it's easier to make performance mistakes, I don't think that's the tool or framework's fault.

In this way, I think publishing the Complete Guide to Rails Performance was placing my faith in the developer community of Rails. If I didn't think that people could make their Rails apps faster through knowledge and skills, and instead they had to wait until the framework or the language itself got faster, I would have gone to work at Github or Shopify and made a bunch of patches to Rails and Ruby. I might have started an alternative, "lightweight" framework or ORM that prioritized performance over usefulness and productivity. Instead, I think that **teaching Rails developers how to find and fix performance problems** will make a bigger dent in the average Rails app's response time than improving the language or framework's performance by even 2-3x, or by removing "dangerous" features.

As I think we've slowly discovered over the course of trying to make Ruby 3x faster, there is no "waste" or "bloat" that can be cut out of a framework or language without cost that suddenly makes the whole thing faster. It's sort of like how politicians always promise to "cut waste in government spending", but no-one can ever tell you exactly where or how which programs will be cut. Everything was implemented for a reason. There is no magic wand or amount of man-hours that can be waved at these problems. I've discovered this in my consulting and writing as well. I wish it was that easy. But it isn't.

However, far from Jeff's doomsday attitude, I believe that the macro picture for Ruby and Rails performance looks good, as it always had. Ruby 2.0 to 2.5 made a number of incremental performance improvements, particularly in garbage collection. I feel like the community has become more mature and performance-savvy over the last few years too. We're waking up the mainstream Rails developer to things like `jemalloc` and teaching them how to use ActiveRecord and avoid performance issues.

The technical future of Ruby looks strong, too. Ruby 2.6 will contain a JIT compiler. How cool is that? TruffleRuby has made great progress to becoming useable enough to run a Rails application. JRuby continues to truck along with more performance improvements and compatibility fixes all the time. The technical future of the language hardly looks dim - in fact, I think it's much brighter than it was in 2011, when I got started in Ruby and Rails.

I'll continue to do my part for the Rails performance community by publishing and writing, to improve the technical skills and capacity of the average Rails developer so that they can make their apps faster. Here's to you, developers!
