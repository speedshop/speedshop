---
layout: post
title: "Organization for Transformative Works Performance Audit"
date: 2026-05-29 0:00:00
summary: "A Rails performance audit report for the Organization for Transformative Works and Archive of Our Own."
readtime: 6131 words / 25 minutes
wordcount: 6131
---

What follows is the complete text of an audit report I produced for the Organization for Transformative Works, a non-profit which was for many years run one of the largest fan-fiction archives on the Internet.

This was produced as part of my [Ruby on Rails performance retainer service](https://www.speedshop.co/retainer.html). Since the app is open source, OTW has kindly agreed to let me publish the report online for all to see.

The [Archive Of Our Own](https://github.com/otwcode/otwarchive), also known as "AO3", is a Rails application that is more than 16 years old. It was the focus of my engagement.

Without any further ado, here's what I handed over to OTW and their crack team of volunteers. I think I am one of a very, very small number of people who has ever been _paid_ to work on AO3. The sheer amount of volunteer love and sweat in this project is truly astounding.

## The Report

It's an honor to work on behalf of such an engaged community like the one surrounding AO3. It's also a tremendous honor to be one of the few people (maybe ever?) to get paid to work on this application. What you've accomplished with the volunteer time you have is truly incredible.

For some context, AO3 is certainly one of the largest scale applications I've worked on in terms of requests per second. Certainly, in terms of just requests per dollar spent on the server rack, it's one of the most efficient I've ever worked on.

I see three main areas for improvement:

* Removing footguns which could potentially result in incidents in the future
* Make the app feel faster for your users
* Targeted reduction of technical debt

To do this, I strongly suggest tracking and improving these two numbers:

1. The number of active, non-idle database connections to the primary.
2. Controller's p95 web transaction service time.

> **AI Disclosure:** In compiling this report, I made extensive use of LLMs for research. I did not use LLMs to generate any of the text in this report.

This document is organized at the top level by our desired Outcomes, which are my goals for your performance improvements over the next six months. Underneath that are specific Recommendations to achieve those outcomes. Each Recommendation has an associated cost and benefit, rated subjectively on a 5 point scale.

Ratings are designed mostly to be relative to each other, i.e. a 5 is always harder or more valuable than a 4, etc. Even cost/benefit roughly means I think it's a toss-up whether or not you should do it, while a cost higher than the benefit rating means I think it's not worth doing in the near term future.

I hope you enjoy this document and find it a useful guide for the next 6-12 months of performance work on your application.

## Outcome: Remove Footguns

In the intro, I said you should focus on **reducing the number of active, non-idle database connections** to the primary. I see this as your primary scale bottleneck. If that number consistently stays at or below ~1/2 the number of CPUs on the DB (which, IIRC, was like 196 or something?) you'll be golden! Easy as that, right?

This section is mostly about reducing opportunities for downtime (though not all directly relate to that DB metric).

### Recommendation: Remove puma_worker_killer. Cost: 1 Benefit: 2

You have `puma_worker_killer` in the `Gemfile`. There's no other config in the gem for it, but this gem is frequently configured with env variables.

PWK's job is to `SIGTERM` processes which go over a particular memory threshold. This sounds like a nice-to-have "safety" feature, but it's a footgun in waiting.

Several years ago I was consulting on a client project and the app was just really slow. I was looking at the response times and thinking, this app is about twice as slow as it probably should be. What's going on? We removed `puma_worker_killer` and watched response times drop in half instantly.

It turned out that someone had installed and configured `puma_worker_killer` years ago and had forgotten about it. As the app grew over time, it continued to _work_, but the baseline memory usage of the app just kept increasing, leading to more and more frequent process restarts triggered by `puma_worker_killer`. In the end, it turned out Puma processes were processing about 20 requests on average before being restarted.

Old processes are fast processes. We want processes to stick around for as long as possible.

`puma_worker_killer` combines two things which are almost always _very difficult_ to observe as an SRE:

1. Configuration in ENV variables. ENV variables are almost always forgotten about. No one knows what they are and what they are set to, because they often contain secrets. Access to them is restricted as a result, and they're not easily checked or in the front of anyone's mind.
2. The "failure mode" is high process restarts, which is almost never properly observed. If PWK's thresholds are set too low, the only way you're going to find out is if you look at how often process restarts are happening and think: hm, that's a bit high (which, you may not even realize after looking at it). Your app could be restarting _after serving only a single request_ and you might not notice it, if load is low enough and you've provisioned enough puma processes.

`puma_worker_killer` is sort of a relic from a Heroku-dominant era, where you needed to fit processes into teeny-tiny dynos of like 512MB. Nowadays, most people buy cloud hardware with 4GB of RAM per CPU, and an application which cannot fit within that constraint reliably is far more sick than something `puma_worker_killer` can even address.

For that reason, I think `puma_worker_killer` should be removed from the setup.

### Recommendation: Change send_data to a background job powered workflow. Cost: 2 Benefit: 3

You have a couple places in the codebase where you're using `send_data` to send files of fairly significant size down to the client:

1. **DownloadsController#show**
2. **send_csv_data** helper, used by ChallengeSignupsController, TagWranglers controller, AdminUsers controller.

There are two big issues with what's happening here.

* **Memory usage**. You're loading ~several mb of stuff into memory at once to put some of these CSVs together. In a web process, that memory usage sticks around and is difficult to get rid of. In a background process, usually this kind of "dirtiness" in the heap is already occurring so you're not making things much worse, and it's in general easier to stop and restart background job processes.
* **Transmitting large files to the client is slow** Ruby web servers aren't really designed for this. Puma does not buffer client responses and so you're essentially locking up the thread for as long as it takes to stream this response back to the client. It's worse for single-threaded situations (which you're in I think, for web today).

Both of these I think could get out of hand and cause some minor incidents.

For me, the best path forward would be to reorient the whole thing around a background job:

1. Controller kicks off a job to generate the CSV.
2. Controller returns to the web client a URL and says "your CSV will be here when it's done".
3. Background job does the CSV work and uploads to S3.
4. S3 serves the CSV.

This would solve both problems for you at once. You could optionally try to work to stream the CSV upload as well to reduce memory usage in the worker, but honestly I think just getting it out of the web process is enough.

### Recommendation: Install some kind of database monitoring product Cost: 1 Benefit: 3

I think of observability stacks for Rails app as having three main components:

1. **Infrastructure**. Most of the time this is coupled to your provider, e.g. AWS Cloudwatch, but can include 3rd parties like Datadog.
2. **APM/RUM**. Options include Sentry, Datadog, New Relic, etc.
3. **Database**. Options include pganalyze, pghero, Datadog's Database Monitor.

I feel like we're missing the last one, particularly for an app like this where performance and stability is so sensitive to DB conditions.

I'm flying a bit in the dark here because I think there are really good options here for Postgres but less so for InnoDB/MySQL. It is, of course, possible to use _only parts_ of Datadog and not the whole hog, and I believe DD's database monitoring is like $70/80 a month. I _think_ the only open source option here is [Percona PMM](https://github.com/percona/pmm)? But I've never used it and can't say if it's any good, and it doesn't have an index advisor.

A good database monitoring solution does the following:

1. Index suggestion. Based on actual query data, can do things like gauge how much impact a new index has on writes, how big it would be, what queries it would alleviate.
2. Capture and visualize EXPLAIN plans.
3. CPU, Memory, active connection count metrics.

I'm not really sure what the best direction to go here is, but I was definitely feeling the absence of this tooling when preparing this report.

### Recommendation: Move load to readers with queues and GET requests. Cost: 3 Benefit: 3

I see a lot of people create replicas and then basically struggle to direct any meaningful usage to them. You're bottlenecked pretty much entirely by your SQL primary, so moving more usage to them would be helpful.

I've only seen two strategies really work here.

The first is to create **read only job queues**. These are job queues which are duplicates of an existing queue, like `high`, but only allow jobs in that queue to talk to the replica database using ActiveRecord's multi-db/role support.

So, instead of just a `utilities` queue, you might also have a `utilities-read-only` queue. You'd have an `around_perform` hook in ApplicationJob that does something like:

```ruby
def use_replica_if_read_only
  if read_only_queue?
    begin
      ActiveRecord::Base.connected_to(role: :reading) { yield }
    rescue ActiveRecord::ReadOnlyError
      self.class.set(queue: writable_queue_name).perform_later(*arguments)
    end
  else
    yield
  end
end

def read_only_queue?
  queue_name.include?("read-only")
end

def writable_queue_name
  queue_name.gsub(/[-_]?read-only[-_]?/, "")
end
```

This pattern makes it easy to transition significant amounts of background jobs to only touch the reader.

Second, you can make `GET` requests only talk to the reader. *In theory*, GET requests should not have any side effects or writes, so this should be possible. In addition, Rails makes it [easy to "read your own writes"](https://guides.rubyonrails.org/active_record_multiple_databases.html#activating-automatic-role-switching):

> Rails guarantees "read your own write" and will send your GET or HEAD request to the writer if it's within the delay window. By default the delay is set to 2 seconds. You should change this based on your database infrastructure. Rails doesn't guarantee "read a recent write" for other users within the delay window and will send GET and HEAD requests to the replicas unless they wrote recently.

I took a brief look around and don't see a lot of major issues with GET side effects. Lots of stuff writes to Redis but obviously that's not a problem.

### Recommendation: Improve the ES failure handling. Cost: 2 Benefit: 4

Currently, the app has a pretty hard failure path when Elastic goes down.

If ES is unreachable, searches, connection refusal, or brownouts/timeouts end up in 500s, which will cascade and take down the app as the service degrades. It's my impression that this has happened in the past.

I think it could be instructive to look at how [the Rubygems.org codebase tends to hold Elasticsearch much more at a distance](https://github.com/rubygems/rubygems.org), which means the service is a lot more resilient to ES outages.

Here's a few things I think you could improve:

1. Add a query timeout in every query body.
2. Add a tighter client timeout - probably something like ~2s. I saw a few timeouts in the Sentry data that showed 30s timeouts in use. If you don't get a response in 2 seconds, you're not gonna get one in 30.
3. Add more layered error handling. When you catch a connection failure, timeout or other Elasticsearch error, return what you can and the rest can 200.

The app current treats ES as implicitly available, which I think the past shows is not a great assumption. If ES was treated as a non-critical read-only feature, you could degrade the site into a no-search mode that I think would greatly improve your overall uptime.

I would also install timeouts in queries and clients so that brownouts affect you far less - better not to tie up a Ruby process for that long.

### Recommendation: Move audits to a different database or truncate. Cost: 1 Benefit: 2

Like most people who have a "paper trail" feature in the database, I think you're just starting to feel some pain on this one, given the size of this table.

It's unclear to me what your obligations are regarding how long these audits need to be kept. Obviously, the easiest thing to do is have a policy to only keep them around for short periods of time and dump the rest.

Multi-db has a number of weird risks that just aren't that important for audits: transactional integrity, cascading deletes. The "best-effort" compromises you'll make by doing multi-db here I think are fine for the use-case.

If you can't do that, I think audits make good sense to move to a separate database. You only read from them rarely, and the read performance isn't a big deal for them (since only admins can view) so any performance loss on "I can't JOIN natively on these tables anymore" is basically not an issue.

Since user model changes and admin activity updates don't happen _that_ often, I kinda doubt there's much write load being added here. It would just be an improvement to the overall database size, making it easier to backup and possibly improving cache hitrates a little.

### Recommendation: Shard a "works" database (workers, chapters, kudos) by work_id, and "activity" database (readings, inbox_comments) by user_id. Cost: 4 Benefit: 5

You asked me in Slack about shards.

I do see two pretty clear groupings of models that could shard:

* **Work-owned objects**, like workers, chapters, kudos.
* **Activity objects, owned by users**, like readings, inbox_comments.

You could potentially split `comments` as well into two models, one for comments on Works and the other for comments on tags and admin posts somewhere else. The polymorphism means it wouldn't work to shard in my scheme today.

There's still some important relations though that wouldn't survive this scheme:

1. `Reading.visible` joins directly between works and readings.
2. `Work.update_stat_counter` might need a rewrite if you don't also shard comments.

It would also mean you'd need to probably do some kind of event/async system to get things to sync across databases. Comments created on a work would have to emit an event or job which then means inbox rows get created for users, etc. This is _kind of_ already how Reading creation works via `SADD`, so maybe this isn't that hard actually? And since you already cache so much, perhaps moving the source of those caches from 1 db to several just doesn't feel that painful in the view layer?

Of course it introduces eventual consistency, but I don't think that's actually a huge concern, given what I've seen in the app's usage?

It may be that audits are the easiest way to get your feet wet on ActiveRecord multi-db, and then readings and inbox_comments in a new (sharded) db are the second step.

## Outcome: Top controllers, by traffic, should all have a p95 of less than 1 second.

I think the second most important thing I'd like to accomplish, beyond just keeping the website up more, would be to make it feel faster for your users.

Currently, Sentry reports the overall p95 of all web transactions as 200ms, which is actually quite good. However, today, you have several transactions where the p95 is significantly higher:

1. **BookmarksController#index**, 2.58 seconds.
2. **AutocompleteController#tag**, 2.98 seconds. Most autocomplete controller actions have similar p95s.
3. **DownloadsController#show**, 7.72 seconds

These three are what I would like to focus effort on, because the rest feel pretty good (or at least, additional effort here would not cause significant user-noticeable gains in performance).

### Recommendation: Swap Bullet for Prosopite, default to fail in tests. Cost: 2 Benefit: 3

I've never been all that high on Bullet, but recently I've had a lot of success with [prosopite](https://github.com/charkost/prosopite). It's highly accurate, with basically zero false positives. That means you can set up a workflow where Prosopite is configured to `raise` by default in the test environment. That means you can't ship new features with proven N+1s! That's an extremely powerful thing to be always checking for in the background without any additional effort.

Usually what I do with clients is work along the following axis:

1. Install prosopite, log in dev and test.
2. Add prosopite as an RSpec context tag, like `:check_for_n_plus_ones`. Add it to all test classes which don't have N+1s in them today (add them everywhere they wouldn't fail a test today).
3. Gradually burn through the remaining bad examples/classes, adding the context one by one, until you have just a few left. At that point, you can...
4. Make prosopite `raise` by default in test and remove the remaining N+1s as global ignores in prosopite's config.

It's extremely useful!

### Recommendation: Turn YJIT on. Cost: 1 Benefit: 2

You have YJIT disabled in `application.rb`. I recommend trying it. Pretty consistently, what I see is that it makes that app ~10-15% faster for 20-30% higher memory use.

You'll have to look at your current server provisioning to decide if that's worth it for you.

If you have any memory left, might as well use it and reduce load on your servers by ~10-15%. If you don't have any memory left, then I guess you're stuck with keeping it off.

In my experience, Ruby 3.4+ does quite well with YJIT on. Of course it's also quite stable, since basically everyone has it turned on now.

### Recommendation: Refactor Rails.cache.fetch into view-layer fragment caches. Cost: 2 Benefit: 3

Looking through the traces, my overall picture is that you are over-using cache, peppering sometimes hundreds of cache calls all over the place. I can see how you got here. You're trying to remove load from the SQL database and put it somewhere else. But from the perspective of total latency of the entire transaction, you haven't improved things much (Redis isn't magically faster than a hot, in-the-buffers hit from a MySQL db).

If you look at, for example, `_intro_module.html.erb`, there's several cache calls happening right in a row.

I think this could be improved by focusing less on `Rails.cache` manual usage, but instead focusing on more cache (and cache-reuse) of entire HTML fragments at the view layer. You're caching _more_ activity (not just the query but also the HTML generation) and also across potentially _multiple_ queries and datasources.

Another example: on the homepage, for each marked for later work, there are 5 cache round trips to render the blurb, even though the fragment itself is already cached. If the entire readings section was single fragment keyed per-user, you could turn 30 cache ops into 1.

### Recommendation: Use Turbo Drive or Turbo Frames. Cost: 4 Benefit: 5.

I harp on this one on social media a lot but it's true. **The biggest performance impact you can have on a web app user is to turn a full page navigation into an SPA-style route change**. For "golden path" Rails apps like AO3, that means using Turbo.

The reason why these kinds of requests are so much faster is because the CSSOM and Javascript VM are re-used. You don't need to completely relayout everything, recalculate the CSSOM and re-execute all your JS. You can just move on! It's truly the only thing that remove **seconds** from a user waiting on the page to do something, rather than milliseconds.

For AO3, I think the most realistic transition would be to use Turbo Frames. It asks the least amount from the current setup in order to make the transition. I've done this migration myself on a legacy ActiveAdmin panel with lots of custom JQuery stuff, and I was able to make it happen pretty quickly.

A more ambitious transition is Turbo Drive. I find that pretty much every jQuery plugin's assumption about how pageloads work will break, however. It would require an extensive inventory of _all_ your JavaScript and the behaviors you expect to work, and probably adding a lot more tests for that level of integration/browser behavior than what you have today.

It's a lot of work, but there's really nothing that makes pageloads faster. If you can turn a full-page-nav into something else, people really feel it.

### Recommendation: Turn on Cloudflare Polish Cost: 1 Benefit: 3

Cloudflare Polish automatically serves `webp` and `avif` formatted images to compatible clients. You have Cloudflare on, but Polish is not.

These image formats can save ~10-50% filesize, depending on the image. I love it, it's probably one of the easiest frontend optimizations you can make. Underneath, since it's working based on the Accept header, it literally can't break anything for anyone because the client _has to tell you_ they accept the format before Cloudflare decides to serve it to them!

I recommend the `lossy` setting because in practice I haven't seen any visible degradation.

### Recommendation: Change CSRF policy to :header_or_legacy_token Cost: 2 Benefit: 3

You've got this somewhat-unusual `token_dispenser.json` route which you use to generate a CSRF token, which then gets provided to any form that needs it. You need to do this because you want to be able to cache logged-out pages with HTTP, which means of course you can't put a CSRF token in `<head>`.

Since Rails 8.2, you now have the option to change how CSRF authentication works.

In Rails 8.2, you can configure Rails to check the [`Sec-Fetch-Site` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site), which is sent by browsers on every request.

From MDN:

> this header tells a server whether a request for a resource is coming from the same origin, the same site, a different site, or is a "user initiated" request. The server can then use this information to decide if the request should be allowed.

Possible values:

cross-site
The request initiator and the server hosting the resource have a different site (i.e., a request by "potentially-evil.com" for a resource at "example.com").

same-origin
The request initiator and the server hosting the resource have the same origin (same scheme, host and port).

same-site
The request initiator and the server hosting the resource have the same site, including the scheme.

none
This request is a user-originated operation. For example: entering a URL into the address bar, opening a bookmark, or dragging-and-dropping a file into the browser window.

So, Rails allows updates from `same-origin` or `same-site`, disallows all `cross-site` (unless in Rails' `trusted_origins`) or header missing (except GET of course). Since browsers themselves set Sec-Fetch-Site, it cannot be forged.

With the header, the following all becomes unnecessary:

* HomeController#token_dispenser
* updatedCachedTokens()
* loadedCSRF
* csrf_meta_tags in layouts, authentication_token in forms

Of course, this is not supported in every browser ever.

It is supported in:

- Chrome 76+ (2019)
- Firefox 90+ (2021)
- Safari 16.4+ (2023)
- Edge 79+ (2020)

I don't think AO3 has any official compatibility targets (e.g. [https://browsersl.ist/](https://browsersl.ist/)) (maybe it's time to officially come up with some?).

You can test this out by switching to `header_or_legacy_token`, which will allow browsers which present the header to do so.

The "feature check" though on the browser side is a bit weird. How do you know if you're sending that header or not? You don't! So, the approach (if you can't drop incompatible clients) would be to probably modify the token dispenser so that after the first request, it notices if the browser sent `Sec-Fetch-Site`, and if it did, it tells the frontend "hey, you don't have to come back for any more CSRF tokens. Just present sec-fetch-site." I think you'd probably want to store that in the session cookie or something.

The primary benefit I see here would be then that form actions can happen immediately without waiting for CSRF tokens on a network roundtrip.

### Recommendation: Reduce cache fetches on Bookmarks#index Cost: 3 Benefit: 3

I took a look at a [random Bookmarks#index trace](https://organization-for-transformativ.sentry.io/insights/backend/summary/trace/913a2990d3074f349a9203042bbf62aa/?environment=staging&node=span-bd6b6c3a2376473f&project=4507539185991680&query=transaction.op%3Ahttp.server&referrer=insights-backend-overview&sort=-p95%28span.duration%29&source=performance_transaction_summary&statsPeriod=30d&timestamp=1773123577&transaction=BookmarksController%23index) and saw the following:

* 179 cache spans
* 148 reads
* 31 writes

That's pretty high. Ideally we only go to the cache a handful of times. These were split between the `MemcacheStore` and `LocalStore`. Since the `MemCacheStore` is the only one that costs us $$$ to use and has network latency, I'll focus on that.

- Reads: 114
- Hits: 84
- Misses: 30
- Hit rate: 73.7%

That's a pretty poor hitrate. If we look in a bit more detail, here's how that breaks down by key shape:

- ao3-v8.0:views/bookmark-blurb-bookmarks/...-v3
  - 20 reads
  - 19 hits
  - 1 miss
  - 1 put
- ao3-v8.0:.../blurb_css_classes
  - 20 reads
  - 20 hits
- ao3-v8.0:.../bookmark_count
  - 40 reads total
  - **18 remote misses**!
  - 22 local hits
  - 18 puts
 ### Work metadata / fragments

 - ao3-v8.0:byline_data/...
     - 17 reads
     - 17 hits
 - ao3-v8.0:/v4/work_blurb_tag_cache_key/...
     - 7 reads
     - 7 hits
 - ao3-v8.0:views/works/...-showwarn-showfreeform-v11
     - 7 reads
     - 7 hits
 - ao3-v8.0:views/works/.../stats-v4
     - 7 reads
     - 2 hits
     - 5 misses
     - 5 puts
- ao3-v8.0:works/.../count_visible_comments
  - 5 reads
  - 5 misses
  - 5 puts
- ao3-v8.0:works/.../kudos_count-v2
  - 5 reads
  - 5 hits
- ao3-v8.0:/v1/public_bookmarks_count/...
  - 5 reads
  - 5 hits

I basically see these as a kind of "fast" N+1 problem. Ideally I think we'd only be going to each keyspace one time. It's a sign of an "insufficiently Russian-dolled-cache". I think it also gets back to the observation I had earlier that you are in a lot of caches replacing single database queries with single cache lookups, which doesn't do much for you.

I'd try to roll these up a single `bookmark_row` fragment, which should be able to wrap around ~8 of those keys (kudos, blurb, views, byline data, etc etc). Then you can `MGET` for all the bookmarks you want.

It's also possible the cache keys like `byline_data` and `blurb_css_classes` are just too small to help to begin with and should be removed completely.

I think this transition is difficult because it requires a deep domain understanding of the cache keys and ERD involved here, but it doesn't look impossible to me.

### Recommendation: Always preload current_user roles. Cost: 1 Benefit: 2

I noticed a lot of Sentry traces with `roles` lookups peppered all over the place. You already do the right thing in `permit_yo`:

```ruby
def has_role?(role_name)
  return self.roles.any? { |role| role.name == role_name.to_s } if self.roles.loaded?

  role = Role.find_by(name: role_name)
  self.roles.include?(role)
end
```

So that's good. The fact that these queries are happening then is a sign that the association wasn't `loaded`.

I've encountered this permissions thing a ton of times. I think it's almost always worth it to just load all user roles upfront rather than try to be clever about which you load when.

Since you're using Devise, you override `serialize_from_session`:

```ruby
def self.serialize_from_session(key, salt)
  record = includes(:roles).where(primary_key => key).first
  record if record && record.authenticatable_salt == salt
end
```

There are also a handful of places in views where you inspect `user.roles` directly, e.g. `@user.roles.any?`. I'd replace all these with `has_role?` and then make sure the association is loaded.

### Recommendation: Timeout Autocompletes, add a hard LIMIT, and consider LRU caches around common 3+ char words. Cost: 2 Benefit: 4

`AutocompleteSource.autocomplete_lookup` is a very performance sensitive method that powers all the various autocomplete controllers. It routinely has a p95 of 2sec+.

There are a couple of things I'd do to improve it:

**Add a hard LIMIT on `zrevrangebyscore` for 3+ character terms.**. Currently the ZREVRANGEBYSCORE can take 2 seconds or more when the search term is something really common. Adding a `limit: [0,50]` here would, I think, really help bring that P95 down a lot, because the score key of `autocomplete_tag_all_score_some_popular_word` could be thousands of tags, which you then just truncate down to 15 in the end. Ouch.

**Get a small LRU cache together for popular 3+ character words**. After trying the previous fix, if I still wanted more "juice", I think I'd try to create a separate CacheStore with a given size limit (so that I can use LRU behavior to only cache "the most important" stuff) for 3+ character search parameters. I think this could even be process-local using MemoryStore and a size setting of like `10.megabytes`.

**Add a timeout to these queries, particularly the zrevrangebyscore**. One thing I'm always thinking about with Redis is that it's single-threaded. It's really not designed to service long-running queries, because those queries may end up blocking other concurrent operations. Unlike a SQL database, which parallelizes quite well across CPU cores, your Redis DB is just locked to a single core and so a very slow query can end up affecting others.

I would also consider a circuit breaker and/or open timeout to the autocomplete Redis. If it goes down, the site should be able to quickly recover and not go down completely.

### Recommendation: Use a test queue to make builds faster, more reliably fast Cost: 2 Benefit: 2

You currently have 13 Cucumber jobs working as explicit directory splits, and 3 RSpec jobs also statically configured. So, if you get unlucky and one of those Cucumber jobs takes 14 minutes, well, that's how long the build takes. There's no balancing happening there.

I tell basically everyone these days to **balance tests between workers using a queue**. This allows the maximum amount of redistribution to occur, so that the minimum and maximum total execution time per worker (process on a single-machine approach, or per agent/runner/VM as well) to be as close together as possible.

The "enterprisey" way is to pay for Knapsack Pro. However, there are a number of open source projects that can do similar stuff.

I'm going to take as a constraint here that we have to use the default, free Github Actions Runner hardware. Those machines have 4 vCPU and 16GB of RAM per.

1. [test-queue](https://github.com/tmm1/test-queue) by the prolific tmm1, author of stackprof. I'm pretty sure the networked mode wouldn't work in Github Actions, but the fork-based model would. That would allow you to use the remaining 3 idle cores on each Github Actions worker. Has cucumber support though maybe it's not very heavily used.
2. [parallel_tests](https://github.com/grosser/parallel_tests) by grosser. Popular, I've seen this one in use a few times. Not networked, but supports Cucumber.
3. [spec-wrk](https://github.com/danielwestendorf/specwrk/blob/main/.github/workflows/specwrk-multi-node.yml) by Daniel Westendorf. No Cucumber support here but _does_ support networked runners in Github Actions. Could be cool if you added a Cucumber adapter!

With some networked/parallel runners I think you could easily take builds down to 5 minutes or less.

### Recommendation: Remove resque inline in tests. Cost: 2 Benefit: 3

You have the following in your `resque` config:

```ruby
  Resque.inline = ENV["RAILS_ENV"] == "test"
```

And in `test.rb`:

```ruby
config.active_job.queue_adapter = :inline
```

So in tests, all Resque enqueue calls execute synchronously.

In my experience (which is more with the equivalent setting in Sidekiq), this ends up creating two big problems for you:

1. Tests now have a ton of extra state and state modification flying around that's hard to reason about because it's all implicit. This makes the tests harder to understand.
2. You will also be doing a lot of work which is not necessary to make the assertions pass.

For both of those reasons, I prefer that any background queue draining be done **explicitly** instead of implictly. If you use the traditional arrange/act/assert framework, I think tests are much clearer if you include these queue drain/execute job calls in the **Act** or **Arrange** phase.

It looks like you kind of already started to do this with `suspend_resque_workers` in `spec_helper.rb`.

For ActiveJob, switching is easy. You just change the `queue_adapter` to `:test` and then drain only when necessary. Some specs already are written this way.

Resque doesn't really have a Sidekiq fake mode built in. I think we basically could extend `suspend_resque_workers` to be the default.

## Outcome: Reduce technical debt

These are just a couple of things I noticed as I was looking around.

### Recommendation: Complete the migration to Puma. Cost: 1 Benefit: 1

Of course _I'm_ gonna say this, as I'm the maintainer. But I really do think it's a great application server! It looks like you're about halfway to transitioning.

Moving from single-threaded Unicorn to single-threaded Puma should just be a "straight swap". When you use the servers in this way they don't really differ that much in terms of behavior.

I think probably this application never becomes multi-threaded. It's probably just more hassle than it's worth. I usually tell people: what changing your concurrency model gives you (from processes to threads, threads to fibers, etc) is allows you to run more open, idle connections with low switching cost and low memory use. If your workload doesn't have that need, process based concurrency probably works just fine for you. Almost every major Rails app, the real giga-shops like Shopify, Github, Intercom, Gusto: they're all running single-threaded. They decided the threading bugs aren't worth the ~30% memory savings. I suspect, given the limited volunteer resources and the age of this app, that the calculus is the same for you.

### Recommendation: load_admin_banner doesn't need caching. Cost: 1 Benefit: 1

This is just one of a couple of places I noticed unnecessary caching. From what I can see in the traces, this takes about 1ms whether or not it's hot or cold. Since it's on every page load via before_action, that stood out to me.

```ruby

  before_action :load_admin_banner
  def load_admin_banner
    if Rails.env.development?
      @admin_banner = AdminBanner.where(active: true).last
    else
      # http://stackoverflow.com/questions/12891790/will-returning-a-nil-value-from-a-block-passed-to-rails-cache-fetch-clear-it
      # Basically we need to store a nil separately.
      @admin_banner = Rails.cache.fetch("v1/admin_banner") do
        banner = AdminBanner.where(active: true).last
        banner.nil? ? "" : banner
      end
      @admin_banner = nil if @admin_banner == ""
    end
  end
```

Fetching _the exact same row every time_ in SQL is just not any slower than reading it out of Redis. Just a bit of unnecessary complexity.

### Recommendation: Move JQuery/JQueryUI to first party serving. Cost: 1 Benefit: 1

I noticed you're serving the following:

```
https://ajax.googleapis.com/ajax/libs/jquery/1.9.0/jquery.min.js
https://ajax.googleapis.com/ajax/libs/jqueryui/1.10.0/jquery-ui.min.js
```

I think in general, for a site with the kinds of concerns about privacy that AO3 has, you generally just want to "talk" to as few third parties as possible. So just for user privacy reasons, I think it's better to serve these first-party. And they're like 15 year old versions, so who knows, maybe one day Google axes them.

It _used_ to be thought in the frontend communities that 3rd party CDNs were a performance "boost" because "oh, everyone will use the same CDN cached version of this library" but that became less true over the years as people realized this could be used to fingerprint clients and so browsers ended up changing how caching worked and breaking this behavior completely. And of course, not a lot of people use 13-year-old versions of jQuery anymore.

### Recommendation: Remove active_record_query_trace and replace with native Rails verbose query logs Cost: 1 Benefit: 1

You currently have three overlapping query source trace mechanisms.

1. `active_record_query_trace` gem. Appends a colorized multi-line call stack after each query in dev logs.
2. `config.active_record.verbose_query_logs` = true.  Rails 5.2+ built-in, appends ↳ file:line after each query
3. `config/initializers/active_record_log_subscriber.rb` — a custom LogQuerySource module that also prepends ↳ file:line

While I love this feature and of course recommend everyone use it, it is kinda baked into Rails now and I prefer to use the Rails mainline stuff where I can rather than bring in dependencies. Probably we only need one of these right?

It is a little bit of a bummer but verbose_query_logs only displays a single line:

```
Before (with gem):
User Load (0.4ms)  SELECT "users".* FROM "users" WHERE ...
  app/models/concerns/is_active.rb:11:in `active?'
  app/models/user.rb:67:in `active?'
  app/controllers/users_controller.rb:42:in `index'

After (without gem):
User Load (0.4ms)  SELECT "users".* FROM "users" WHERE ...
  ↳ app/controllers/users_controller.rb:42
```

I think you can just keep verbose_query_logs and delete the other two.

### Recommendation: Move to SLO queues Cost: 3 Benefit: 5

SLO queues are a concept introduced in my book, Sidekiq in Practice. It was adopted successfully at Gusto and the community at large has really picked up and run with the idea.

The basic idea is that all queues in your system are named after their queue time SLO - how long they promise that a job will be in the queue until it is a executed.

For example, a common setup is:

```
within_0_seconds
within_5_minutes
within_15_minutes
within_1_hour
```

You then launch any number of processes in Resque which listen to one of those queues (and one queue only).

This allows you to intelligently autoscale: we don't need to start scaling up the within 1 hour queue until the latency of that queue is above ~45 minutes or so.

Using many queues which are based on just the "domain" or "subject" of the queue (e.g. imports, exports, orders, etc) leads to an explosion of queue types, whose SLOs are not clear. You don't know when to page someone or wake them up because the queue time expectation is not clear.

For a volunteer-run shop, I think getting completely crystal-clear about how long it's OK to wait in the queue until someone needs to be notified would be really helpful. It also makes it easy for app developers in the future to "sign up" for what level of queue time they need (it's right in the name!).
