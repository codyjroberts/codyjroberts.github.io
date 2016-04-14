---
title: Git Interactive
date: 2015-08-27T10:08:00-00:00
category: til
---

When you're working on a project it can be easy to get carried away and start
making changes to multiple files without committing.  This occasionally happens to me 
when I'm working on a Rails project.  While working on a feature I'll notice a
bug, quickly fix it, then go back to the feature I was working on.  This happens
a few times and then I realize that I haven't commit any changes to the branch.

This is where git's interactive staging really comes in handy.  Instead of manually
adding and patching files, 'git add -i' will take you through the process of
staging.

~~~bash
*** Commands ***
  1: status       2: update       3: revert       4: add untracked
  5: patch        6: diff         7: quit         8: help
What now>
~~~

The menu is pretty intuitive.  Check the status with 1, add new files with 4 and
patch chunks with 5.  Go ahead and read more about this nifty feature
[here](https://git-scm.com/book/en/v2/Git-Tools-Interactive-Staging).
