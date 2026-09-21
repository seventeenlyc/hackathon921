# User Story — First-Time Player Journey

## Product Premise

**Prompt Defense** is an endless tower-defense game for young players learning how to work with AI through play.

The player does not directly control towers.

The player writes the strategy Prompt. The AI observes the battlefield, makes decisions, and plays autonomously.

The core loop is:

> **Write Prompt → AI fights → observe the result → improve the Prompt → spend another Coin → try again**

The educational goal is not to teach players to memorize Prompt templates. It is to help them learn how to communicate intent to AI:

- define a goal;
- provide context;
- set constraints;
- establish priorities;
- handle exceptions;
- observe actual AI behavior;
- revise instructions based on evidence.

The game should teach these concepts through consequences in the game world rather than through conventional lessons.

---

# User Story

## Persona

**Alex, age 13**

Alex has used AI chat products before, but does not understand Prompt Engineering as a formal concept.

Alex enters Prompt Defense because it looks like a game, not because they intend to take an AI course.

Their motivation is simple:

> **“Can I teach my AI to survive longer than everyone else's?”**

---

## Story 1 — First Launch

### As a first-time player

I want to immediately understand what makes this tower-defense game different,

so that I know what I am supposed to do without reading a long tutorial.

### Experience

The opening screen says:

> # PROMPT DEFENSE
>
> You don't control the towers.
>
> **You teach the AI how to fight.**
>
> The AI will enter the battlefield alone and follow the strategy it understands from your Prompt.
>
> **How many waves can your AI survive?**

Primary action:

> **START TRAINING**

The player should understand one fundamental idea before entering the game:

> **I am not controlling the character. I am teaching the AI player.**

---

# Story 2 — First Tutorial Run

### As a new player

I want to see a working example Prompt before I have to write one,

so that I can understand how natural-language instructions affect the AI.

### Experience

The first tutorial run provides a pre-written Prompt.

Example:

> **Goal:** Protect the base for as long as possible.
>
> **Strategy:** Build damage towers where enemies stay in range for the longest time.
>
> **Resource Rule:** Do not spend all available gold. Keep at least 20% in reserve.
>
> **Exception:** When fast enemies appear, prioritize slowing them.

The interface explains:

> **This is your AI's Prompt.**
>
> It tells the AI:
>
> - what it should achieve;
> - how it should behave;
> - what rules it must follow;
> - what to do when special situations occur.

The player does not need to edit anything yet.

Primary action:

> **LET AI FIGHT**

---

# Story 3 — Watch the Prompt Become Behavior

### As a new player

I want to see the AI act according to the example Prompt,

so that I understand that the Prompt changes real behavior rather than merely producing text.

### Experience

The battle starts.

The player cannot directly:

- build towers;
- upgrade towers;
- sell towers;
- target enemies.

The AI makes these decisions.

Important decisions are made visible with concise explanations such as:

> **FAST ENEMIES DETECTED**
>
> Prompt rule matched:
>
> “When fast enemies appear, prioritize slowing them.”
>
> **AI ACTION: BUILD SLOW TOWER**

The game should show decision summaries and actions, not hidden model chain-of-thought.

The player observes a direct causal relationship:

> **My instruction → AI decision → battlefield consequence**

---

# Story 4 — The Tutorial AI Must Fail

### As a new player

I want the first Prompt to contain an understandable weakness,

so that failure creates a reason for me to improve the Prompt myself.

### Experience

The tutorial Prompt is intentionally incomplete.

For example, it contains no strategy for Boss enemies.

The AI successfully clears several waves.

Then:

> **WAVE 5 — BOSS**

The AI continues following its normal strategy.

Eventually:

> # BASE DESTROYED
>
> **Your AI survived to Wave 5.**

The game then explains the failure in simple language:

> Your AI followed its instructions.
>
> But your Prompt never told it what to prioritize when a Boss appeared.

The game asks:

> **What should your AI learn before the next run?**

---

# Story 5 — First Prompt Edit

### As a new player

I want to improve one part of the Prompt after seeing a concrete failure,

so that I can experience the effect of giving AI a better instruction.

### Experience

The game highlights the editable Prompt.

The player adds a rule such as:

> **If a Boss appears, prioritize upgrading the highest-damage tower.**

A Prompt Budget is visible:

> **Prompt: 147 / 200**

Primary action:

> **INSERT 1 COIN — TRY AGAIN**

Every real run costs one Coin.

Editing and thinking are free.

Testing a strategy costs a Coin.

This gives each attempt meaning:

> **1 Coin = 1 Experiment**

---

# Story 6 — The First Magic Moment

### As a player

I want my modified Prompt to cause a clearly different AI action,

so that I can see that my instruction mattered.

### Experience

The second run reaches Wave 5.

The Boss appears.

The interface shows:

> **BOSS DETECTED**
>
> Prompt rule matched:
>
> “If a Boss appears, prioritize upgrading the highest-damage tower.”
>
> **AI ACTION: UPGRADE CANNON → LV.2**

The AI clears the wave.

The player sees:

> **NEW PERSONAL BEST**
>
> Previous: Wave 5  
> Current: Wave 8

This is the primary product magic moment:

> **“I changed one sentence, the AI changed its behavior, and I survived longer.”**

If the product cannot reliably create this moment, additional systems should not be prioritized.

---

# Story 7 — Learn Prompt Structure Through Gameplay

### As a returning player

I want to gradually learn better ways to instruct my AI,

so that improving at Prompting feels like improving at the game.

### Principle

The game should not begin with:

> “Lesson 1: Prompt Engineering”

Prompt concepts should be introduced as tools for solving game problems.

The learning progression can gradually introduce concepts such as:

### Goal

> What should the AI ultimately achieve?

### Context

> What information matters when the AI makes a decision?

### Constraint

> What must the AI always or never do?

### Priority

> When multiple problems occur, which one matters most?

### Exception

> What should happen in unusual or dangerous situations?

### Verification

> How should the AI check whether its previous action worked?

### Feedback

> What should the AI learn from a failed run?

The player therefore learns Prompt structure because it helps them survive more waves.

---

# Story 8 — Prompt Frameworks

### As a more experienced player

I want to discover structured Prompt frameworks,

so that I can organize increasingly complex instructions without simply making the Prompt longer.

### Experience

Established frameworks such as **CO-STAR** can be introduced as optional learning material or advanced Prompt-building techniques.

However, the game should not imply that one framework is universally correct.

Different frameworks solve different communication problems.

For the tower-defense environment, the game may eventually introduce a game-native structure focused on Agent behavior, for example:

## GEAR

**G — Goal**

What should the AI achieve?

**E — Environment**

What battlefield information should it pay attention to?

**A — Action Rules**

What actions should it take under specific conditions?

**R — Restrictions**

What resource, risk, or behavioral limits must it respect?

This naming is exploratory rather than a finalized learning standard.

The important product principle is:

> **Prompt structure is learned because it improves gameplay, not because the player is required to memorize terminology.**

---

# Story 9 — Endless Mode

### As a player who has completed the tutorial

I want to send my AI into an endless tower-defense run,

so that I can discover how strong my Prompt really is.

### Rules

The game uses an endless sequence of increasingly difficult waves.

The battlefield remains deliberately simple.

Complexity should come primarily from:

- increasing enemy strength;
- different enemy compositions;
- resource pressure;
- strategic tradeoffs;
- the player's Prompt.

The player's final score is:

> # WAVE REACHED

For example:

> **WAVE 23**

Secondary metrics may include:

- survival time;
- tokens used;
- AI cost;
- average decision latency;
- number of actions.

But these should not obscure the primary score.

A young player should immediately understand:

> **Higher Wave = my AI survived longer.**

---

# Story 10 — Coin Economy

### As a player

I want each run to have a small cost,

so that I think about how to improve my Prompt before testing it again.

### Rule

> **1 Coin = 1 Run**

Prompt editing is free.

Reading previous results is free.

Viewing leaderboard strategies is free.

Thinking is free.

Sending the AI into another battle costs one Coin.

For the hackathon version, monetization is not required.

A player can simply receive a fixed number of Coins, for example:

> **3 Coins available**

After a failed run:

> **2 Coins remaining**

Before the final attempt:

> **LAST COIN**

The Coin therefore represents an experiment budget rather than merely a payment mechanism.

---

# Story 11 — Leaderboard

### As a player

I want to compare my AI's performance with other players,

so that I have a reason to improve my Prompt beyond beating my own score.

### Experience

The game provides a leaderboard:

| Rank | Player | Wave | Strategy |
|---|---|---:|---|
| 1 | Luna | 37 | View Prompt |
| 2 | Alex | 31 | View Prompt |
| 3 | Max | 28 | View Prompt |

The primary ranking metric is:

> **Highest Wave Reached**

The leaderboard transforms Prompt writing from a private exercise into a competitive game.

The question becomes:

> **Who can teach the same AI to survive the longest?**

---

# Story 12 — Learn From Other Players

### As a player

I want to inspect successful strategies from stronger players,

so that the community itself becomes part of the learning system.

### Experience

Alex sees:

> **Luna — Wave 37**

Alex opens Luna's run.

The game shows the Prompt used for that run.

Alex can study:

- what rules Luna included;
- what Luna prioritized;
- how much gold Luna told the AI to reserve;
- how Luna handled fast enemies and Bosses;
- how concise or complex the Prompt was.

The player can then choose:

> **FORK THIS PROMPT**

The game creates:

> **Luna's Prompt → Alex's Version**

Alex modifies the strategy and spends one Coin to test it.

The resulting learning loop is:

> **Observe → Copy → Understand → Modify → Test**

The leaderboard is therefore not only competitive.

It is also a shared library of strategies.

---

# Story 13 — Prompt Budget

### As an experienced player

I want the game to limit how much instruction I can give the AI,

so that writing a better Prompt requires prioritization rather than endlessly adding rules.

### Rule

Example:

> **PROMPT BUDGET: 200 characters**

The exact limit should be tuned through playtesting.

The purpose is to prevent the dominant strategy from becoming an enormous instruction document containing an answer for every possible situation.

A constrained Prompt forces the player to ask:

- Which instruction matters most?
- Is this sentence redundant?
- Can several cases be expressed as one general rule?
- Is this rule too vague?
- Which lesson from the previous run is worth keeping?

This makes abstraction and concise communication part of the game.

---

# Complete First-Time Journey

The intended first-session flow is:

**Enter game**

↓

> “I teach the AI instead of controlling the towers.”

↓

**See example Prompt**

↓

> “A Prompt contains goals and rules.”

↓

**Watch AI fight**

↓

> “It actually follows those instructions.”

↓

**AI dies**

↓

> “Why did it fail?”

↓

**Game identifies an understandable Prompt gap**

↓

**Player adds one instruction**

↓

**Spend 1 Coin**

↓

**AI encounters the same situation**

↓

**AI behaves differently**

↓

**Survive longer**

↓

> “My sentence changed what the AI did.”

↓

**Gradually learn Goal / Context / Constraint / Priority / Exception / Feedback**

↓

**Enter Endless Mode**

↓

**Set a personal record**

↓

**Open Leaderboard**

↓

**Study a stronger player's Prompt**

↓

**Fork it**

↓

**Modify it**

↓

**Spend another Coin**

↓

**Try to beat the record**

↓

**Repeat**

---

# Core Learning Loop

The game ultimately teaches:

> **Intent → Instruction → Behavior → Observation → Revision**

The player is not rewarded for knowing Prompt terminology.

The player is rewarded for successfully communicating with an autonomous AI.

The educational outcome emerges from the gameplay loop:

> **Play → Fail → Reflect → Prompt → Test → Compare → Learn → Retry**

---

# Product North Star

The player's explicit motivation should be:

> **“I want to train an AI that can survive longer than yours.”**

The learning outcome underneath that motivation is:

> **“I am getting better at expressing goals, constraints, priorities, exceptions, and feedback to AI.”**

The game succeeds when a young player does not feel that they are completing an AI course, but nevertheless becomes measurably better at communicating intent to an AI system through repeated play.
