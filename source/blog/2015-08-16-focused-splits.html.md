---
title: Focused Splits
date: 2015-08-16
category: til
---

Tmux and vim have been integral to my coding practices for about a year now.  One
of my favorite vim settings is this little bit here.

~~~vim
set winwidth=84
set winheight=5
set winminheight=5
set winheight=999
~~~

This will auto-resize vim splits to maximize the viewing area of the current
pane.  I find this really helpful for switching back and forth between multiple
files when I don't need to see the contents of each one at the same time.  If I
happen to need to see the contents of two files at the same time I'll usually
just open up a tmux pane.

I can't exactly remember where I found this, but I think it was from [Ben
Orenstein](http://www.benorenstein.com/) of thoughtbot.  A quick search finds many .vimrc with these
settings.  It was thoughtbot, however, who introduced me to the amazing ability
to use the same key binding to jump between vim/tmux panes.  I highly recommend
checking it [out](https://robots.thoughtbot.com/seamlessly-navigate-vim-and-tmux-splits).
