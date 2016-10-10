---
layout: post
title:  "Action Cable - Friend or Foe?"
date:   2015-09-30 11:00:00
categories:
  - performance
summary: Action Cable will be one of the main features of Rails 5, to be released sometime this winter. But what can Action Cable do for Rails developers? Are WebSockets really as useful as everyone says?
readtime: 4205 words/21 minutes
---

One of the marquee features of Rails 5 (likely releasing sometime Q1/Q2 2016) is Action Cable, Rails' new framework for dealing with WebSockets. Action Cable has generated a lot of interest, though perhaps for the wrong reasons. "WebSockets are those cool things the Node people get to use, right?" and "I heard WebSockets are The Future™" seem to be the prevailing attitudes, resulting in a lot of confusion and uncertainty about Action Cable's purpose and promise. It doesn't help that current online conversation around WebSockets is thick with overly fancy buzzwords like "realtime" and "full-duplex". {% marginnote "<img src="https://i.imgur.com/U7vo0Hs.gif" /> <br> <i>Full-duplex? That's twice as good as half-duplex right?</i>" %}  In addition, some claim that a WebSockets-based application is somehow more scalable than traditional implementations. What's a Rails application developer to make of all of this?

This won't be a tutorial or a how-to article - instead, we're going to get into the *why* of Action Cable, not the *how*.

Let's start with a review of how we got here - what problem is WebSockets trying to solve? How did we solve this problem in the past?

## Don't hit the refresh button!

The Web is built around the HTTP request. In the good old days, you requested a page (GET) and received a response with the page you requested. We developed an extensive methodology (REST) to create a stateless Web based on requesting and modifying resources on the server.

It's important to realize that an HTTP request is *stateless* - in order for us to know *who* is making the request, the request must tell us itself.  Without reading the contents of the request, there's really no way of knowing what request belongs to which session. Usually, in Rails, we do this with a secure "signed" cookie {% sidenote 1 "A signed cookie means that a client can't tamper with it's value - important if you want to prevent session hijacking!" %} that carries a user ID.

As the web grew richer, with video, audio and more replacing the simple text-only pages of yesteryear, we started to crave a constant, uninterrupted connection between server and client. There were places where we wanted the server to communicate back to the client (or vice versa) frequently:

* **Clients needing to send rapidly to the server**. High-throughput environments, like online browser-based games, needed clients and servers to be able to exchange several messages *per second*. Imagine trying to implement an first person shooter's networking code with HTTP requests. Sometimes this is called a "full-duplex" or "bi-directional" communication.
* **"Live" data**. Web pages started to have "live" elements - like a comments section that automatically updated when a new comment was added (without a page refresh), chat rooms, constant-updated stock tickers and the like. We wanted the page to update itself when the data changed on the server *without* user input. Sometimes this is called a "realtime" application, though I find that term buzzwordy and usually inaccurate. "Realtime" implies constant, nano-second resolution updating. The reality is that the comments section on your website probably doesn't change every nano-second. If you're lucky, it'll change once every minute or so. I prefer the term "Live" for this reason. We all know "live" broadcasts are every so slightly delayed by a few seconds, but we'll still call it "live!".
* **Streaming**. HTTP proved unsuitable for streaming data. For many years, streaming video required third-party plugins (remember RealPlayer?). Even now, streaming data other than video remains a complex task without WebSockets (remote desktop connections, for example), and it remains nearly impossible to stream binary data to Javascript without Flash or Java applets (eek!).

## The Road to WebSockets

Over the years, we've developed a lot of different solutions to these problems. Some of them haven't really stood the test of time - Flash XMLSocket relays, and `multipart/x-mixed-replace` come to mind. However, several techniques for solving the "realtime" problem(s) are still in use:

### Polling

Polling involves the client asking the server, on a set interval (say, three seconds) if there is any new data. {% marginnote "<img src="https://i.imgur.com/dKNsN7L.gif" /> <br> <i>Hey! Hey server! You got any new data? Server? SERVER!</i>." %} Returning to the "live comments" example, let's say we have a page with a comments section. To create this application with polling, we can write some Javascript to ask the server every three seconds for the latest comment data in JSON format. If there is new data, we can update the comment section.

The advantage of polling is that it's rock-solid and extremely simple to set up. For these reasons, it's in wide use all over the Web. It's also very resistant to network outage and latency - if you miss 1 or 2 polls because the network went out, for example, no problem! You just keep polling until eventually it works again. Also, thanks to the stateless nature of HTTP, IP address changes (say, a mobile client with data roaming) won't break the application.

However, you might already have alarm bells going off in your head here regarding scalability. You're adding considerable load to your servers by causing *every* client to hit your server *every* 3 seconds. There are ways to alleviate this - HTTP caching is a very good one - but the fact remains, your server will have to return a response to every client every 3 seconds, no matter what.

Also, while polling is acceptable for "live" applications (most people won't notice a 3-second delay in your chat app or comments thread), it isn't appropriate for rapid back-and-forth (like games) or streaming data.

### Long-polling

Long-polling is a bit like polling, but without a set interval between requests (or "polls"). The client sends a request to the server for new data - if the server has new data, then it sends a response back like normal. If there isn't any new data, though, it *holds the request open*, effectively creating a persistent connection, and then when it receives new data, completes the response.

Exactly how this is accomplished varies. There are several "sub-techniques" of long-polling you may have heard of, like [BOSH](https://en.wikipedia.org/wiki/BOSH) and [Comet](https://en.wikipedia.org/wiki/Comet_(programming)). Suffice it so say, long-polling techniques are considerably more complicated than polling, and can often involve weird hacks like hidden iframes.

Long-polling is great when data doesn't change very often. Let's say we connect to our live comments, and 45 seconds later a new comment is added. Instead of 15 polls to the server over 45 seconds from a single client, a server would open only 1 persistent connection.

However, it quickly falls apart if data changes often. Instead of a live comments section, consider a stock ticker. A stock's price can changes at the millisecond interval (or faster!) during a trading day. That means any time the client asks for new data, the server will return a response immediately. This can get out of hand quickly, because as soon as the client gets back a response it will make a new request. This could result in 5-10 requests per second *per client*. You would be wise to implement some limits in your client! Then again, as soon as you've done that, your application isn't really RealTime™ anymore!

### Server-sent Events (SSEs)

Server-sent Events are essentially a one-way connection from the server to the client. Clients can't use SSEs to send data back to the server. Server-sent Events got turned into a browser API back in 2006, and is currently supported by every major browser *except* any version of Internet Explorer.{% marginnote "<img src="https://i.imgur.com/FHB2E1f.gif" />" %}

Using server-side events is really quite simple from the (Javascript) client's side. You set up an `EventSource` object, define an `onmessage` callback describing what you'll do when you get a new message from the server, and you're off to the races.

Server-sent event support was added to Rails in 4.0, through [ActionController::Live](http://tenderlovemaking.com/2012/07/30/is-it-live.html).

Serving a client with SSEs requires a persistent connection. This means a few things: using Server-sent events won't work pretty much at all on Heroku, since they'll terminate any connections after 30 seconds. Unicorn will do the same thing, and WEBrick won't work at all. So your options are Passenger, Puma, or Thin, and you can't be on Heroku. Oh, and no one using your site can use Internet Explorer. You can see why ActionController::Live hasn't caught on. It's too bad - the API is really simple and for most implementations ("live" comments, for example) SSE's would work great.

## How WebSockets Work

This is the part where I say: "WebSockets to the rescue!" right?  Well, maybe. But first, let's investigate what makes them unique.

### Persistent, stateful connection

Unlike HTTP requests, WebSocket connections are *stateful*. What does this mean? To use a metaphor - HTTP requests are like a mailbox. All requests come in to the same place, and you have to look at the request (e.g., the return address) to know who sent it to you. In contrast, WebSocket connections are like building a pipe between a server and the client. Instead of all the requests coming in through one place, they're coming in through hundreds of individual pipes. When a new request comes through a pipe, you know *who sent the request*, without even looking at the actual request.

The fact that WebSockets are a *stateful* connection means that the connection between a particular client machine and server must remain constant, otherwise the connection will be broken. For example - a *stateless* protocol like HTTP can be served by any of a dozen or more of your Ruby application's servers, but a WebSocket connection must be maintained by a single instance for the duration of the connection. This is sometimes called "sticky sessions".{% sidenote 2 "As far as I can tell, Action Cable solves this problem using Redis. Basically, each Action Cable server instance listens to a Redis pubsub channel. When a new message is published, the Action Cable server rebroadcasts that message to all connected clients. Because all of the Action Cable servers are connected to the same Redis instance, everyone gets the message." %} It also makes load balancing a lot more difficult. However, in return, you don't need to use cookies or session IDs.

### No data frames

To generalize - let's say that every message has *data* and *metadata*. The *data* is the actual thing we're trying to communicate, and *metadata* is data about the data. You might say a communication protocol is more *efficient* if it requires less *metadata* than another protocol.

HTTP needs a decent amount of metadata to work. In HTTP, metadata is carried in the form of HTTP headers.

Here are some sample headers from an HTTP response of a Rails server:

```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Vary: Accept-Encoding
X-Runtime: 0.121484
X-Powered-By: Phusion Passenger 5.0.14
X-Xss-Protection: 1; mode=block
Set-Cookie: _session_id=f9087b681653d9daf948137f7ece14bf; path=/; secure; HttpOnly
Server: nginx/1.8.0 + Phusion Passenger 5.0.14
Via: 1.1 vegur
Cache-Control: max-age=0, private, must-revalidate
Date: Wed, 23 Sep 2015 19:43:03 GMT
X-Request-Id: effc7fe2-0ab8-4462-8b64-cb055f5d1b13
Strict-Transport-Security: max-age=31536000
Content-Length: 39095
Connection: close
X-Content-Type-Options: nosniff
Etag: W/"469b11fcecff716247571b85ff1fc7ae"
Status: 200 OK
X-Frame-Options: SAMEORIGIN
```

Yikes, that's 652 bytes before we even get to the data. And we haven't even gotten to the cookie data you sent with the request, which is probably another 2,000 bytes. You can see how inefficient this might be if our data is really small or if we're making a lot of requests.

WebSockets gets rid of most of that. To open a WebSockets connection, the client makes a HTTP request to the server with a special `upgrade` header. The server makes an HTTP response that basically says "Cool, I understand WebSockets, open a WebSockets connection." The client then opens a WebSockets pipe.

Once that WebSockets connection is open, data sent along the pipe requires *hardly any metadata at all*, usually less than about 6 bytes. Neat!

What does all of this mean to us though? Not a whole lot. You could easily do some fancy math here to prove that, since you're eliminating about 2KB of data *per message*, at Google scale you could be saving petabytes of bandwidth. Honestly, I think the savings here are going to vary a lot from application to application, and unless you're at Top 10,000 on Alexa scale, any savings from this might amount to a few bucks on your AWS bill.

### Two-way communication

{% marginnote "<img src="https://www.reactiongifs.com/r/prs.gif" /> <br> <i>How many duplexes do YOU have, Red Ranger?</i>" %} One thing you hear a lot about WebSockets is that they're "full-duplex". What the hell does that mean? Well, clearly, *full* duplex is *better* than *half-duplex* right? That's double the duplexes!

All that full-duplex really means is **simultaneous communication**. With HTTP, the client usually has to complete their request to the server before the server can respond. Not so with WebSockets - clients (and servers) can send messages across the pipe at any time.

The benefits of this to application developers are, in my opinion, somewhat unclear. Polling can simulate full-duplex communication (at a ~3 second resolution, for example) fairly simply. It does reduce latency in certain situations - for example, instead of requiring a request to pass a message back to the client, the server can just send a message immediately, as soon as it's ready. But the applications where ~1-3 second of latency matters are few and far between - gaming being an obvious exception. Basecamp's chat app, Campfire, used 3-second polling for 10 years.

### Caniuseit?

What browsers can you actually use WebSockets in? Pretty much all of them. This is one of WebSockets' biggest advantages over SSE, their nearest competitor. [caniuse.com puts WebSockets' global adoption rate at about 85%](http://caniuse.com/websockets), with the main laggards being Opera Mini and old versions of the Android browser.

## Enter Action Cable

Action Cable was [announced at RailsConf 2015 in DHH's keynote](https://www.youtube.com/watch?v=KJVTM7mE1Cc#t=42m30s). He briefly touched on polling - Basecamp's chat application, Campfire, has used a 3-second polling interval for over 10 years. But then, David said:

> "If you can make WebSockets even less work than polling, why wouldn't you do it?"

That's a great mission statement for Action Cable, really. If WebSockets were as easy as polling, we'd all be using it. Continuous updates are just simply better than 3-second updates.  If we can get continuous updates without paying any cost, then we should do that.

So, that's our yardstick - is Action Cable as easy (or easier) to use than polling?

### API Overview

Action Cable provides the following:

* A "Cable" or "Connection", a single WebSocket connection from client to server. It's worthwhile to note that Action Cable assumes you will only have one WebSocket connection, and you'll send all the data from your application along different...
* "Channels" - basically subdivisions of the "Cable". A single "Cable" connection has many "Channels".
* A "Broadcaster" - Action Cable provides its own server. Yes, you're going to be running another server process now. Essentially, the Action Cable server just uses Redis' pubsub functions to keep track of what's been broadcasted on what cable and to whom.

Action Cable essentially provides just one class, `Action Cable::Channel::Base`. You're expected to subclass it and make your own Cables, just like ActiveRecord models or ActionController.

Here's a full-stack example, straight from the Action Cable source:

```ruby
  # app/channels/application_cable/connection.rb
  module ApplicationCable
    class Connection < Action Cable::Connection::Base
      # uniquely identify this connection
      identified_by :current_user

      # called when the client first connects
      def connect
        self.current_user = find_verified_user
      end

      protected
        def find_verified_user
          # session isn't accessible here
          if current_user = User.find(cookies.signed[:user_id])
            current_user
          else
            # writes a log and raises an exception
            reject_unauthorized_connection
          end
        end
    end
  end

  class WebNotificationsChannel < ApplicationCable::Channel
    def subscribed
      # called every time a
      # client-side subscription is initiated
      stream_from "web_notifications_#{current_user.id}"
    end

    def like(data)
      comment = Comment.find(data['comment_id')
      comment.like(by: current_user)
      comment.save
    end
  end

  # Somewhere else in your app
  Action Cable.server.broadcast \
    "web_notifications_1", { title: 'New things!', body: 'All shit fit for print' }

  # Client-side coffescript which assumes you've already requested the right to send web notifications
  @App = {}
  App.cable = Cable.createConsumer "ws://cable.example.com"
  App.cable.subscriptions.create "WebNotificationsChannel",
    received: (data) ->
      # Called every time we receive data
      new Notification data['title'], body: data['body']
    connected: ->
      # Called every time we connect
    like: (data) ->
      @perform 'like', data
```

A couple of things to notice here:

* Note that the channel name "WebNotificationsChannel" is implicit, based on the name of class.
* We can call the public methods of our Channel from the client side code - I've given an example of "liking" a notification.
* `stream_from` basically establishes a connection between the client and a named Redis pubsub queue.
* `Action Cable.server.broadcast` adds a message in a Redis pubsub queue.
* We have to write some new code for looking up the current_user. With polling, usually whatever code we already have written works just fine.

Overall, I think the API is pretty slick. We have that very Rails-y feel of a Cable's class methods being exposed to the client automatically, the Cable's class name becoming the name of the channel, et cetera.

Yet, this does feel like a lot of code to me. And, in addition, you're going to have to write more JavaScript than what you have above to connect everything together. Not to mention that now we've got a Redis dependency that we didn't have before.

What I didn't show above is some things that Action Cable gives you for free, like a 3-second heartbeat on all connections. If a client can't be contacted, we automatically disconnect, calling the `unsubscribe` callback on our Channel class.

In addition, [the code, as it stands right now](https://github.com/rails/actioncable), is a joy to read. Short, focused classes with well-named and terse methods. In addition, it's extremely well documented. DHH ain't no slouch. It's a fast read too, weighing in at about 850 lines of Ruby and 200 lines of CoffeeScript.

## Performance and Scaling

Readers of my blog will know that my main focus is on performance and Ruby app speed. It's been vaguely claimed that WebSockets offers some sort of scaling or performance benefit to polling. That makes some intuitive sense - surely, large sites like Facebook can't make a 3-second polling interval work.

But moving from polling to WebSockets involves a big trade-off. You're trading a high volume of HTTP requests for a high volume of *persistent connections*. And persistent connections, in a virtual machine like MRI that lacks true concurrency, sounds like trouble. Is it?

### Persistent connections

> Also note that your server must provide at least the same number of database connections as you have workers. The default worker pool is set to 100, so that means you have to make at least that available.

Action Cable's server uses EventMachine and Celluloid under the hood. However, while Action Cable uses a worker pool to send messages to clients, it's just a regular old Rack app and will need to be configured for concurrency in order to accept many incoming concurrent connections.

What do I mean? Let's turn to `thor`, a WebSockets benchmarking tool. It's a bit like `siege` or `wrk` for WebSockets. We're going to open up 1500 connections to an Action Cable server running on Puma (in default mode, Puma will use up to 16 threads), with varying incoming concurrency:

| Simultaneous WebSocket connections | Mean connection time |
| -------- | -------- |
| 3   | 17ms |
| 30  | 196ms |
| 300 | 1638ms |

As you can see, Action Cable slows linearly in response to more concurrent connections. Allowing Puma to run in clustered mode, with 4 worker processes, improves results slightly:

| Simultaneous WebSocket connections | Mean connection time |
| -------- | -------- |
| 3   | 9ms |
| 30  | 89ms |
| 300 | 855 ms |

Interestingly, these numbers are slightly better than a [node.js application I found](https://github.com/sitegui/nodejs-websocket/blob/master/samples/chat/server.js), which seemed to completely crumple under higher load. Here are the results against this node.js chat app:

| Simultaneous WebSocket connections | Mean connection time |
| -------- | -------- |
| 3   | 5ms |
| 30  | 65ms |
| 300 | 3600 ms |

Unfortunately, I can't really come up with a great performance measure for *outbound* messaging. Really, we're going to have to wait to see what happens with Action Cable in the wild to know the full story behind whether or not it will scale. For now, the I/O performance looks at least comparable to Node. That's surprising to me - I honestly didn't expect Puma and Action Cable to deal with this all that well. I suspect it still may come crashing down in environments that are sending many large pieces of data back and forth quickly, but for ordinary apps I think it will scale well. In addition, the use of the Redis pubsub backend lets us scale horizontally the way we're used to.

## What other tools are available?

That concludes our look at Action Cable. What alternatives exist for the Rails developer?

### Polling

Let's take the example from above - basically pushing "notifications", like "new message!", out to a waiting client web browser. Instead of pushing, we'll have the client basically ask an endpoint for our notification partial every 5 seconds.

```javascript
function webNotificationPoll(url) {
  $.ajax({
    url : url,
    ifModified : true
  }).done(function(response) {
    $('#notifications').html(response);
    // maybe you call some fancy JS here to pop open the notification window, do some animation, whatever.
  });
}

setInterval(webNotificationPoll($('#notifications').data('url'), 5000);
```

Note that we can use HTTP caching here (the ifModified option) to simplify our responses if there are no new notifications available for the user.

Our show controller might be as simple as:

```ruby
class WebNotificationsController < ApplicationController
  def show
    @notifications = current_user.notifications.unread.order(:updated_at)

    if stale?(last_modified: @notifications.last.updated_at.utc, etag: @notifications.last.cache_key)
      render :show
    end

    # note that if stale? returns false, this action
    # automatically returns a 304 not modified.
  end
end
```

Seems pretty straightforward to me. Rather than reaching for Action Cable first, in most "live view" situations, I think I'll continue reaching for polling.

### MessageBus

[MessageBus](https://github.com/SamSaffron/message_bus) is Sam Saffron's messaging gem. Not limited to server-client interaction, you can also use it for server to server communication.

Here's an example from Sam's README:

```ruby
message_id = MessageBus.publish "/channel", "message"

MessageBus.subscribe "/channel" do |msg|
  # block called in a background thread when message is received
end
```
```javascript
// in client JS
MessageBus.start(); // call once at startup

// how often do you want the callback to fire in ms
MessageBus.callbackInterval = 5000;
MessageBus.subscribe("/channel", function(data){
  // data shipped from server
});

```

I like the simplicity of the API. On the client side, it doesn't look all that different from stock polling. However, being backed by Redis and allowing for server-to-server messaging means you're gaining a lot in reliability and flexibility.

In a lot of ways, MessageBus feels like "Action Cable without the WebSockets".

MessageBus does not require a separate server process.

### Sync

[Sync](https://github.com/chrismccord/sync) is a gem for "real-time" partials in Rails. Under the hood, it uses WebSockets via Faye. In a lot of ways, I feel like Sync is the "application layer" to Action Cable's "transport layer".

The API basically boils down to changing this:

```ruby
<%= render partial: 'user_row', locals: {user: @user} %>
```

to this:

```ruby
<%= sync partial: 'user_row', resource: @user %>
```

But, unfortunately, it isn't that simple. Sync requires that you sprinkle calls throughout your application any time the `@user` is changed. In the controller, this means adding a `sync_update(@user)` to the controller's update action, `sync_destroy(@user)` to the destroy action, etc. "Syncing" outside of controllers is even more of a nightmare.

Sync seems to extend its fingers all through your application, which feels wrong for a feature that's really just an accident of the view layer. Why should my models and background jobs care that my views are updated over WebSockets?

### Others

There are several other solutions available.

* **ActionController::Live**. This might work if you're OK with never supporting Internet Explorer.
* **Faye**. Working with Faye directly is probably more low-level than you'll ever actually need.
* **websocket-rails**. While I'd love another alternative for the "WebSockets for Rails!" space, this gem hasn't been updated since the announcement of Action Cable (actually over a year now).

## What do we really want?

Overall, I'm left with a question: I know *developers* want to use WebSockets, but what do our *applications* want? Sometimes the furor around WebSockets feels like it's putting the cart before the horse - are we reaching for the latest, coolest technology when polling is *good enough*?

> "If you can make WebSockets easier than polling, then why wouldn't you want WebSockets?"

I'm not sure if Action Cable is easier to use than polling (yet). I'll leave that as an exercise to the reader - after all, it's a subjective question. You can determine that for yourself.

But I think providing Rails developers access to WebSockets is a little bit like showing up at a restaurant and, when you order a sandwich, being told to go make it yourself in the back. WebSockets are, fundamentally, a *transportation* layer, not an *application* in themselves.

Let's return to the three use cases for WebSockets I cited above and see how Action Cable performs on each:

* **Clients needing to send rapidly to the server.** Action Cable seems appropriate for this sort of use case. I'm not sure how many people are out there writing browser-based games with Rails, but the amount of access the developer is given to the transport mechanism seems wholly appropriate here.
* **"Live" data** The "live comments" example. I predict this will be, by far, the most common use case for Action Cable. Here, Action Cable feels like overkill. I would have liked to see DHH and team double down on the "view-over-the-wire" strategy espoused by Turbolinks and make Action Cable something more like "live Rails partials over WebSockets". It would have greatly simplified the amount of work required to get a simple example working. I predict that, upon release, a number of gems that build upon Action Cable will be written to fill this gap.
* **Streaming** Honestly, I don't think anyone with a Ruby web server is streaming binary data to their clients. I could be wrong.

In addition, I'm not sure I buy into "WebSockets completely obviates the need for HTTP!" rhetoric. HTTP comes with a lot of goodies, and by moving away from HTTP we'll lose it all. Caching, routing, multiplexing, gzipping and lot more. You *could* reimplement all of these things in Action Cable, but why?

So when *should* a Rails developer be reaching for Action Cable? At this point, I'm not sure. If you're really just trying to accomplish something like a "live view" or "live partial", I think you may either want to wait for someone to write the inevitable gem on top of Action Cable that makes this easier, or just write it yourself. However, for high-throughput situations, where the client is communicating several times per second back to the server, I think Action Cable could be a great fit.
