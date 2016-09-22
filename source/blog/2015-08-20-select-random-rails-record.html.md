---
title: ActiveRecord Random
date: 2015-08-20T18:44:22-05:00
category: til
---

If you're seeding a Rails database, you might run into a problem creating
content that belongs to random users.  In my case, I wanted users to
create questions and comments. "RANDOM()" to the rescue!

~~~ruby
# the SQL Query
user = User.limit(1).order("RANDOM()").to_sql
=> "SELECT  \"users\".* FROM \"users\"  ORDER BY RANDOM() LIMIT 1"

# randomizes users and selects one
user = User.limit(1).order("RANDOM()").first
=> <#User:0x.....>

# now I can use that user to create a comment
user.comments.create(body: "text", question_id: rand(1..20))
~~~

Using the RANDOM() query is much faster than using plain old Ruby, not that
this is particularly important for seeding a test database.
