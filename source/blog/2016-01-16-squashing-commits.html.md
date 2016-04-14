---
title: Squashing Commits
date: "2016-01-16 15:25:35 -0600"
category: til
---

Today I was working on a simple change to a repository I forked
JacobEvelyn/Friends.  The issue was just a few style errors caught by RuboCop.
I made a stupid mistake and the TravisCI build failed (oh the value in CI!).  So
I pushed another commit fixing the changes but felt that the minor fix didn't
warrant it's own commit.  I searched for a solution and came across the ability
to squash commits.  Squashing is just like it sounds, it merges more than one
commit together.

Lets say you have two commits on a branch and you only want one with all the
changes.

~~~bash
# Checkout branch
$ git checkout some-branch
# Interactive rebase
$ git rebase -i
~~~

This will open your default editor with a list of all the commits in the branch.
Rename pick to squash for the commits you wish to squash.  In my case I wanted
to keep the first commit and squash the second. So my editor had something like:

~~~bash
pick [commithash] commit1
squash [commithash] commit2
~~~

Save and quit. The squash proceeds and your editor should open again prompting
you to edit the commit that has now been combined. Save when you're satisfied,
wrapping up the squash.
