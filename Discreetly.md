## Overview

Discreetly is an open protocol anonymous chat system.

The example scenario I am going to use throughout this document is a chat room for Steam games, where the barrier to entry for a room is a certain threshold of achievments accomplished in the game (20% by default?)

## Rooms

A room can be created by the server owner/admin, with certain criteria/barrier to entry.

### Karma Culling

In an anonmyous chat, it is (basically) impossible to know who said something the large majority didn't agree with, but you can prove that you _didn't_ say something. So we can use this to exclude very bad actors using a karma system where users can upvote or downvote messages, which under the hood are non-inclusion proofs, essentially saying "i didn't create this post, and I did or didn't like this".

> This non-inclusion proof includes a new "transiition identity commitment".

After a certain trigger (maybe a certain amount of time like 1 day to start and over time move to every 30 days? or after a certain action on chain), the group can choose to transition, where the server would generate a new version of the room, and everyone would have to make a new semaphore proof with either their old identity commitment or a new one, and everyone who wants to participate in the room would have to make a non-inclusion proof for any of the messages that broke some UPVOTE/DOWNVOTE threshold (configurable by the server, something like 2x more downvotes than upvotes, and [over 20 votes total] | [10% of the room] | [the lowest voted post]).

This would result in multiple iterations of a room, one for each transition, and the rate limit would change per iteration.

- Most Recent Room (T)
  - 1s
- T-1
  - 10s
- T-2
  - 100s // 1:40
- T-3
  - 1000s // 16:40
- T-4
  - 10000s // 2:46:40
- T-5
  - 100000s // 27:46:40 // 1 day 3 hours 46 minutes 40 seconds
- T-6
  - 1000000s // 11:13:46:40 // 11 days 13 hours 46 minutes 40 seconds
- T-7
  - 10000000s // 1:03:13:46:40 // 1 month 3 days 13 hours 46 minutes 40 seconds
- T-8
  - 100000000s // 11:09:03:13:46:40 // 11 months 9 days 3 hours 13 minutes 46 seconds 40 milliseconds
- T-9
  - 1000000000s // 3:01:09:03:13:46:40 // 3 years 1 month 9 days 3 hours 13 minutes 46 seconds 40 milliseconds
