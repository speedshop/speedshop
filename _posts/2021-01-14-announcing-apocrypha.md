---
layout: post
title: "Announcing the Rails Performance Apocrypha"
date: 2021-01-14 0:00:00
summary: "I've written a new book, compiled from 4 years of my email newsletter."
readtime: 499 words / 3 minutes
wordcount: 499
image: apocrypha.jpg
---

{% marginnote_lazy apocrypha_cover.jpg||true %}

Hello Rubyists!

Today, I'm launching a new product: The Ruby on Rails Performance Apocrypha.

Over the last four years, I've written a lot of stuff to this newsletter. Until now, none of that stuff has been publicly accessible if you wanted to go back and read it again. If something useful was posted to the newsletter before you subscribed, you were just sort of screwed. 

So, I've compiled 4 years of writing to this newsletter into a book. It covers my usual topics: performance science and engineering, frontend performance, Ruby performance, and scaling. It's a fun ramble around all of these topics with a lot of tidbits and useful information scattered about. Each chapter is quite short, so it's easy to pick up and put down again. 

[It's available now on Gumroad for just $10.](https://gum.co/apocrypha) As always, it's DRM-free and available in PDF, e-reader and even HTML and plain-text formats. 

I called this book the “apocrypha”, because I consider my “main-line” of Rails performance instruction, the canonical “scripture”, to be my Rails Performance Workshop. By contrast, this book is a bit of an all-over-the-place ramble, and it covers some things that I didn't cover in great detail in my other instructional books and workshops, such as HTTP/2 resource prioritization, and a detailed how-to on how to use New Relic's Ruby VM information. 

Here's the chapter titles, in case you're wondering what's covered:

* What I Value
* Performance Science
* Why Performance?
* You Are Not a Compiler
* What does 10% faster really mean? 
* Benchmarks for Rails Apps 
* Build-your-own APM
* Reading Flamegraphs
* DRM: Database, Ruby, Memory 
* Performance in the Design Space 
* Microservices and Trends
* On Minitest
* Corporate Support for Ruby
* Why is Ruby Slow?
* Popularity
* Stinky Dependencies
* Why Cache?
* Software Quality at Startups
* Frontend
* Simple Frontend Config Changes
* What is TTFB?
* Always Use a CDN
* Page Weights and Frontend Load Times 
* Lazy-loading
* What’s Resource Prioritization? 
* HTML on the Wire
* Exceptions: Silent, not Free
* On Thread-Safety
* What is the GVL? 
* Timeslicing the GVL
* The GVL and C
* Bloat
* Minimum Viable Rails
* The Weird Setting No One Used 
* Object Allocation
* You Should Always Use a Production Profiler 
* Reproducing Issues Locally
* Worker Killers
* What’s QueryCache?
* Reading New Relic’s Ruby VM Tab 
* Test Setup
* What is Time Consumed? 
* Request Queue Times 
* Amdahl’s Law
* Threads
* CPU-bound or IO-bound? 
* What is Swap?
* Database Pools 
* Single-thread Performance 
* Read Replicas
* Why Lambda? 
* Never use Perf-M 
* Daily Restarts

[Check it out on Gumroad.](https://gum.co/apocrypha)
