---
layout: post
title:  "3 ActiveRecord Mistakes That Slow Down Rails Apps: Count, Where and Present"
date:   2019-01-10 7:00:00
summary: "Many Rails developers don't understand what causes ActiveRecord to actually execute a SQL query. Let's look at three common cases: misuse of the count method, using where to select subsets, and the present? predicate. You may be causing extra queries and N+1s through the abuse of these three methods."
readtime: 2778 words / 12 minutes
image: threebadshare.jpg
---

{% marginnote_lazy weirdriddles.gif|"When does ActiveRecord execute queries? No one knows!"|true %}

ActiveRecord is great. Really, it is. But it's an abstraction, intended to insulate you from the actual SQL queries being run on your database. And, if you don't understand how ActiveRecord works, you may be causing SQL queries to run that you didn't intend to.

Unfortunately, the performance costs of many features of ActiveRecord means we can't afford to ignore unnecessary usage or treat our ORM as just an implementation detail. We need to understand exactly what queries are being run on our performance-sensitive endpoints. Freedom isn't free, and neither is ActiveRecord.

One particular case of ActiveRecord misuse that I find is common amongst my clients is that ActiveRecord is executing SQL queries that aren't really necessary. Most of my clients are completely unaware that this is even happening.  

{% marginnote_lazy dirtythree.jpg||true %}

Unnecessary SQL is a common cause of overly slow controller actions, especially when the unnecessary query appears in a partial which is rendered for every element in a collection. This is common in search actions or index actions. This is one of the most common problems I encounter in my performance consulting. It's a problem in nearly every app I've ever worked on.

One way to eliminate unnecessary queries is to poke our heads into ActiveRecord and understand its internals, and know exactly how certain methods are implemented. **Today, we're going to look at the implementation and usage of three methods which cause lots of unnecessary queries in Rails applications: `count`, `where` and `present?`**.

## How Do I Know if a Query is Unnecessary?

I have a rule of thumb to judge whether or not any particular SQL query is unnecessary. Ideally, a Rails controller action should execute **one SQL query per table**. If you're seeing more than one SQL query per table, you can usually find a way to reduce that to one or two queries. If you've got more than a half-dozen or so queries on a single table, you almost definitely have unnecessary queries. {% sidenote 1 "Please don't email or tweet with me with 'Well ackshually...' on this one. It's a guideline, not a rule, and I understand there are circumstances where more than one query per table is a good idea." %}

The number of SQL queries per table can be easily seen on NewRelic, for example, if you have that installed.

{% asset "nplusoneposts.png" %}

{% marginnote_lazy washeyes.jpg|I keep an eyewash station next to my desk for really bad N+1s|true %}

Another rule of thumb is that **most queries should
execute during the first half of a controller action's response, and almost never during partials**. Queries executed during partials are usually unintentional, and are often N+1s. These are easy to spot during a controller's execution if you just read the logs in development mode. For example, if you see this:

```
User Load (0.6ms)  SELECT  "users".* FROM "users" WHERE "users"."id" = $1 LIMIT 1  [["id", 2]]
Rendered posts/_post.html.erb (23.2ms)
User Load (0.3ms)  SELECT  "users".* FROM "users" WHERE "users"."id" = $1 LIMIT 1  [["id", 3]]
Rendered posts/_post.html.erb (15.1ms)
```

... you have an N+1 in this partial.

Usually, when a query is executed halfway through a controller action (somewhere deep in a partial, for example) it means that you haven't [`preload`ed](https://api.rubyonrails.org/classes/ActiveRecord/QueryMethods.html#method-i-preload) the data that you needed.

So, let's look specifically at the `count`, `where` and `present?` methods, and why they cause unnecessary SQL queries.

## .count executes a COUNT every time

I see this one at almost every company I contract for. It seems to be little-known that calling `count` on an ActiveRecord relation will *always* try to execute a SQL query, every time. This is inappropriate in most scenarios, but, in general, **only use `count` if you want to always execute a SQL COUNT _right now_**.

{% marginnote_lazy count.gif|"How many queries do we want per table?"|true %}

The most common cause of unnecessary `count` queries is when you `count` an association you will use later in the view (or have already used):

```
# _messages.html.erb
# Assume @messages = user.messages.unread, or something like that

<h2>Unread Messages: <%= @messages.count %></h2>

<% @messages.each do |message| %>
blah blah blah
<% end %>
```

This executes 2 queries, a `COUNT` and a `SELECT`. The COUNT is executed by `@messages.count`, and `@messages.each` executes a SELECT to load all the messages. Changing the order of the code in the partial and changing `count` to `size` eliminates the `COUNT` query completely and keeps the `SELECT`:

```
<% @messages.each do |message| %>
blah blah blah
<% end %>

<h2>Unread Messages: <%= @messages.size %></h2>
```

Why is this the case? We need not look any further than [the actual method definition of `size` on ActiveRecord::Relation:](https://github.com/rails/rails/blob/94b5cd3a20edadd6f6b8cf0bdf1a4d4919df86cb/activerecord/lib/active_record/relation.rb#L210)

```ruby
# File activerecord/lib/active_record/relation.rb, line 210
def size
  loaded? ? @records.length : count(:all)
end
```

{% marginnote_lazy triggeredcount.jpg||true %}

If the relation is loaded (that is, the query that the relation describes has been executed and we have stored the result), we call `length` on the already loaded record array. [That's just a simple Ruby method on Array](https://ruby-doc.org/core-2.5.0/Array.html#method-i-length). If the ActiveRecord::Relation *isn't* loaded, we trigger a `COUNT` query.

On the other hand, [here's how `count` is implemented](https://github.com/rails/rails/blob/94b5cd3a20edadd6f6b8cf0bdf1a4d4919df86cb/activerecord/lib/active_record/relation/calculations.rb#L41) (in ActiveRecord::Calculations):

```ruby
def count(column_name = nil)
  if block_given?
    # ...
    return super()
  end

  calculate(:count, column_name)
end
```

And, of course, [the implementation of `calculate`](https://github.com/rails/rails/blob/94b5cd3a20edadd6f6b8cf0bdf1a4d4919df86cb/activerecord/lib/active_record/relation/calculations.rb#L131) doesn't memoize or cache anything, and executes a SQL calculation every time it is called.

Simply changing `count` to `size` in our original example would have still triggered a `COUNT`. The record's wouldn't be `loaded?` when `size` was called, so ActiveRecord will still attempt a `COUNT`. Moving the method *after* the records are loaded eliminates the query. Now, moving our header to the end of the partial doesn't really make any logical sense. Instead, we can use the `load` method.

```
<h2>Unread Messages: <%= @messages.load.size %></h2>

<% @messages.each do |message| %>
blah blah blah
<% end %>
```

`load` just causes all of the records described by `@messages` to load immediately, rather than lazily. [It returns the ActiveRecord::Relation, not the records.](https://api.rubyonrails.org/classes/ActiveRecord/Relation.html#method-i-load) So, when `size` is called, the records are `loaded?` and a query is avoided. Voilà.

What if, in that example, we used `messages.load.count`? We'd still trigger a COUNT query!

When *doesn't* `count` trigger a query? Only if the result has been cached by `ActiveRecord::QueryCache`.{% sidenote 2 "I have some Opinions on the use of QueryCache, but that's a post for another day." %} This could occur by trying to run the same SQL query twice:

```
<h2>Unread Messages: <%= @messages.count %></h2>

... lots of other view code, then later:

<h2>Unread Messages: <%= @messages.count %></h2>
```

{% marginnote_lazy pissed.gif|Every time you use count when you could have used size|true %}

**In my opinion, most Rails developers should be using `size` in most of the places that they use `count`.** I'm not sure why everyone seems to write `count` instead of `size`. `size` uses `count` where it is appropriate, and it doesn't when the records are already loaded. I think it's because when you're writing an ActiveRecord relation, you're in the "SQL" mindset. You think: "This is SQL, I should write count because I want a COUNT!"

So, when do you actually want to use `count`? Use it when you won't actually *ever* be loading the full association that you're `count`ing. For example, take this view on Rubygems.org, which displays a single gem:

{% asset "rspecview.png" %}

In the "versions" list, the view does a `count` to get the total number of releases (versions) of this gem.

[Here's the actual code:](https://github.com/rubygems/rubygems.org/blob/d8a48488d29cbfc83efd2e936c74290c54041288/app/views/rubygems/show.html.erb#L36)

```
<% if show_all_versions_link?(@rubygem) %>
  <%= link_to t('.show_all_versions', :count => @rubygem.versions.count), rubygem_versions_url(@rubygem), :class => "gem__see-all-versions t-link--gray t-link--has-arrow" %>
<% end %>
```

The thing is, this view *never* loads *all* of the Rubygem's versions. It only loads five of the most recent ones, in order to show that versions list.

So, a `count` makes perfect sense here. Even though `size` would be logically equivalent (it would just execute a COUNT as well because `@versions` is not `loaded?`), it states the intent of the code in a clear way.

My advice is to grep through your `app/views` directory for `count` calls and make sure that they actually make sense. If you're not 100% sure that you really need a real SQL `COUNT` right then and there, switch it to `size`. Worst case, ActiveRecord will still execute a `COUNT` if the association isn't loaded. If you're going to use the association later in the view, change it to `load.size`.

## .where means filtering is done by the database

What's the problem with this code (let's say its `_post.html.erb`)

```
<% @posts.each do |post| %>
  <%= post.content %>
  <%= render partial: :comment, collection: post.active_comments %>
<% end %>
```

and in Post.rb:

```ruby
class Post < ActiveRecord::Base
  def active_comments
    comments.where(soft_deleted: false)
  end
end
```

{% marginnote_lazy whoaguy.gif||true %}

If you said, "this causes a SQL query to be executed on every rendering of the post partial", you're correct! `where` always causes a query. I didn't even bother to write out the controller code, because *it doesn't matter*. You can't use `includes` or other preloading methods to stop this query. `where` will always try to execute a query!

This also happens when you call scopes on associations. Imagine instead our Comment model looked like this:

```ruby
class Comment < ActiveRecord::Base
  belongs_to :post

  scope :active, -> { where(soft_deleted: false) }
end
```

Allow me to sum this up with two rules: **Don't call scopes on associations when you're rendering collections** and **don't put query methods, like `where`, in instance methods of an ActiveRecord::Base class**.

Calling scopes on associations means we cannot preload the result. In the example above, we can preload the comments on a post, but we can't preload the *active* comments on a post, so we have to go back to the database and execute new queries for every element in the collection.

This isn't a problem when you only do it once, and not on every element of a collection (like every post, as above). Feel free to use scopes galore in those situations - for example, if this was a PostsController#show action that only displayed one post and its associated comments. But in collections, scopes on associations cause N+1s, every time.

The best way I've found to fix this particular problem is to **create a new association**. [Justin Weiss](https://www.justinweiss.com/), of "Practicing Rails", taught me this in [this blog post about preloading Rails scopes](https://www.justinweiss.com/articles/how-to-preload-rails-scopes/). The idea is that you create a new association, which you *can* preload:

```ruby
class Post
  has_many :comments
  has_many :active_comments, -> { active }, class_name: "Comment"
end

class Comment
  belongs_to :post
  scope :active, -> { where(soft_deleted: false) }
end

class PostsController
  def index
    @posts = Post.includes(:active_comments)
  end
end
```

The view is unchanged, but now executes just 2 SQL queries, one on the Posts table and one on the Comments table. Nice!

```
<% @posts.each do |post| %>
  <%= post.content %>
  <%= render partial: :comment, collection: post.active_comments %>
<% end %>
```

The second rule of thumb I mentioned, **don't put query methods, like where, in instance methods of an ActiveRecord::Base class**, may seem less obvious. Here's an example:

```ruby
class Post < ActiveRecord::Base
  belongs_to :post

  def latest_comment
    comments.order('published_at desc').first
  end
```

What happens if the view looks like this?

```
<% @posts.each do |post| %>
  <%= post.content %>
  <%= render post.latest_comment %>
<% end %>
```

{% marginnote_lazy rules.gif||true %}

That's a SQL query on every post, regardless of what you preloaded. In my experience, **every instance method on an ActiveRecord::Base class will eventually get called inside a collection**. Someone adds a new feature and isn't paying attention. Maybe it's by a different developer than the one who wrote the method originally, and they didn't fully read the implementation. Ta-da, now you've got an N+1. The example I gave could be rewritten as an association, like I described earlier. That can still cause an N+1, but at least it can be fixed easily with the correct preloading.

Which ActiveRecord methods should we *avoid* inside of our ActiveRecord model instance methods? Generally, it's pretty much everything in the [`QueryMethods`](https://api.rubyonrails.org/classes/ActiveRecord/QueryMethods.html), [`FinderMethods`](https://api.rubyonrails.org/classes/ActiveRecord/FinderMethods.html), and [`Calculations`](https://api.rubyonrails.org/classes/ActiveRecord/Calculations.html). Any of these methods will usually *try* to run a SQL query, and are resistant to preloading. `where` is the most frequent offender, however.

## any? or exists? and present?

Rails programmers have been struck by a major affliction - they're adding a particular predicate method to just about every variable in their applications. `present?` has spread across Rails codebases faster than the plague in 13th century Europe. The vast majority of the time, the predicate adds nothing but verbosity, and really, all the author needed was a truthy/falsey check, which they could have done by just writing the variable name.

[Here's an example](https://github.com/codetriage/codetriage/blob/b92e347e0f4714b4646be930e341be5a44761b95/app/models/doc_comment.rb#L9) from [CodeTriage](https://www.codetriage.com/), a free and open-source Rails application written by my friend [Richard Schneeman](https://schneems.com/):

```ruby
class DocComment < ActiveRecord::Base
  belongs_to :doc_method, counter_cache: true

  # ... things removed for clarity...

  def doc_method?
    doc_method_id.present?
  end
end
```

What is `present?` doing here? One, it transforms the value of doc_method_id from either `nil` or an `Integer` into `true` or `false`. Some people have Strong Opinions about whether predicates should return true/false or can return truthy/falsey. I don't. But adding `present?` also does something else, and we have to [look at the implementation](https://github.com/rails/rails/blob/94b5cd3a20edadd6f6b8cf0bdf1a4d4919df86cb/activesupport/lib/active_support/core_ext/object/blank.rb#L26) to figure out what:

```ruby
class Object
  def present?
    !blank?
  end
end
```

`blank?` is a more complicated question than "is this object truthy or falsey". Empty arrays and hashes are truthy, but `blank`, and empty strings are also `blank?`. In the example above from CodeTriage, however, the only things that `doc_method_id` will *ever* be is `nil` or `Integer`, meaning `present?` is logically equivalent to `!!`:

```ruby
def doc_method?
  !!doc_method_id
  # same as doc_method_id.present?
end
```

{% marginnote_lazy oldmanyellscloud.jpg||true %}

Using `present?` in cases like this is the wrong tool for the job. If you don't care about "emptiness" in the value you're calling the predicate on (i.e. the value cannot be `[]` or `{}`), use the simpler (and much faster) language features available to you. I sometimes see people even do this on values *which are already boolean*, which means you're just adding verbosity and making me wonder if there's some weird edge cases I'm not seeing.

Alright, that's my style gripe. I understand that you may not agree. `present?` makes more sense when dealing with strings, which can frequently be empty (`""`).

**Where people get into trouble is calling `present?` on ActiveRecord::Relation objects.** What SQL queries do you think [the following code, also from CodeTriage](https://github.com/codetriage/codetriage/blob/b92e347e0f4714b4646be930e341be5a44761b95/app/views/users/token_delete.html.slim#L23) will execute? Assume `@lonely_repos` is an ActiveRecord::Relation.

```
- if @lonely_repos.present?
  section.help-triage.content-section
    | If you delete your account these CodeTriage repos will have no subscribers and will be removed as well.
    ul.bullets
      - @lonely_repos.each do |repo|
        li= link_to repo.full_name, repo_path(repo)
```

The answer is *two*. One will be an existence check, triggered by `@lonely_repos.present?` (`SELECT  1 AS one FROM ... LIMIT 1`), then the `@lonely_repos.each` line will trigger a loading of the entire relation (`SELECT "repos".* FROM "repos" WHERE ...`).

Why? I think you know the drill by now. [Here's the implementation of `empty?` on ActiveRecord::Relation](https://github.com/rails/rails/blob/94b5cd3a20edadd6f6b8cf0bdf1a4d4919df86cb/activerecord/lib/active_record/relation.rb#L215) (Remember: objects are `present?` if they are not `blank?`, and objects are not `blank?` if they are not `empty?`):

```ruby
def empty?
  return @records.empty? if loaded?
  !exists?
end
```

This reminds me of the implementation of `size` - if the records are `loaded?` do a very simple method call on a basic Array, if they're not loaded, *always run a SQL query*. `exists?` has no caching or memoization built in, just like ActiveRecord::Calculations. This means that `exists?`, which is another method people like to write in these circumstances, is actually even worse than `present?`. This code would execute two queries (first a full load of the relation, than a SELECT 1 exists check) where `present?` wouldn't:

```
- @lonely_repos.each do |repo|
  li= link_to repo.full_name, repo_path(repo)
- if @lonely_repos.exists?
  Some text here.
```

I think it should already be obvious as to how to rewrite this to eliminate the SQL existence check:

```
- if @lonely_repos.load.present?
  section.help-triage.content-section
    | If you delete your account these CodeTriage repos will have no subscribers and will be removed as well.
    ul.bullets
      - @lonely_repos.each do |repo|
        li= link_to repo.full_name, repo_path(repo)
```

Boom! Now we'll load the records right away, `present?` will not trigger a SQL query, and neither will `@lonely_repos.each`, because the relation has already been loaded.

Any method on ActiveRecord::Relation which calls `empty?` can trigger these unnecessary existence checks. These methods are `any?`, `empty?`, `none?`, and of course `present?` and `blank?`.

Of course, this all assumes that you're actually loading the *entire Relation* after the existence check. If you're *not*, the existence check is saving you time and memory, and that's great. Keep it! An example might be something like:

```
- if @posts.none?
  This user has no posts.
- # @posts is never called again in the rest of the view
```

## Conclusion

{% marginnote_lazy doless.gif||true %}

As your app grows in size and complexity, unnecessary SQL can become a real drag on your application's performance. Each SQL query involves a round-trip back to the database, which entails, usually, at *least* a millisecond, and sometimes much more for complex `WHERE` clauses. Even if one extra `exists?` check isn't a big deal, if it suddenly happens in every row of a table or a partial in a collection, you've got a big problem!

ActiveRecord is a powerful abstraction, but since database access will never be "free", we need to be aware of how ActiveRecord works internally so that we can avoid database access in unnecessary cases.

## App Checklist

* Look for uses of `present?`, `none?`, `any?`, `blank?` and `empty?` on objects which may be ActiveRecord::Relations. Are you just going to load the entire array later if the relation is present? If so, add `load` to the call (e.g. `@my_relation.load.any?`)
* Be careful with your use of `exists?` - it ALWAYS executes a SQL query. Only use it in cases where that is appropriate - otherwise use `present?` or any other the other methods which use `empty?`
* Be extremely careful using `where` in instance methods on ActiveRecord objects - they break preloading and often cause N+1s when used in rendering collections.
* `count` always executes a SQL query - audit its use in your codebase, and determine if a `size` check would be more appropriate.
