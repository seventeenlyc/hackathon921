# Hackathon 921 — Idea Document

## Working Concept

**A roguelike tower defense game played by humans and AI together.**

> **The player does not control the towers. The player writes the strategy Prompt; the AI goes onto the battlefield and acts on it.**

The goal for the hackathon is to build a **genuinely playable version**, not a broad platform.

---

## 1. Core Idea

Traditional tower defense asks the player to directly place towers, upgrade them, sell them, and react to enemies.

This game changes the control interface.

The human does **not** directly operate the battlefield. Instead, the human writes natural-language strategy instructions such as:

- Keep at least 25% of gold in reserve.
- Prioritize slowing fast enemies before adding damage.
- Build area-of-effect towers near choke points.
- If enemies are close to the base, act immediately instead of spending time on long deliberation.

Once a run starts, the AI observes the game state, makes decisions, and uses game tools to act.

The player then watches the consequences of their Prompt.

The central loop is:

**Write Prompt → AI fights → AI succeeds/fails → understand what happened → rewrite Prompt → try again**

Or, in roguelike language:

**Fight → Die → Learn → Rewrite Prompt → Fight Again**

---

## 2. The Core Fantasy

The player is not the battlefield operator.

The player is the **strategist / trainer / architect of an AI player**.

The fantasy is:

> **“I trained this AI. Now I have to let it fight on its own.”**

This creates a different kind of tension from normal tower defense. Once the battle begins, the player cannot rescue the AI through micro-control. The quality of the player's instructions must survive contact with the game world.

---

## 3. Why This Is Interesting

### 3.1 It should be a real game first

The project should not feel like an Agent benchmark with a game UI attached.

The player should experience:

- experimentation;
- anticipation;
- failure;
- iteration;
- build optimization;
- surprise when the AI interprets an instruction differently than expected;
- satisfaction when a small Prompt change visibly improves behavior.

The key gameplay skill is not clicking faster.

It is **communicating strategy to an intelligence**.

### 3.2 Prompt becomes a game mechanic

For many people, Prompt Engineering is abstract. They type words into a chat box and receive more words back.

This game makes Prompt effects physical and observable inside a simulated world:

**Human language → AI decision → game action → world consequence**

Example:

Run 1:

> Defend the base.

The AI spends aggressively and dies at Wave 5.

The player adds:

> Keep at least 25% of gold for emergencies.

Run 2 reaches Wave 7.

The player immediately understands that a Prompt is not merely a question. It can define behavioral policy, constraints, priorities, strategy, and exceptions.

The game should teach this through play rather than through a “Prompt Engineering 101” tutorial.

### 3.3 Learning Prompting through failure

A player can naturally discover concepts such as:

- goals;
- constraints;
- priorities;
- strategy;
- exceptions;
- ambiguity;
- conflicting instructions;
- feedback;
- memory;
- excessive deliberation;
- latency vs decision quality.

A good failure screen should therefore not only say:

> GAME OVER — WAVE 8

It should help answer:

> **Why did your AI die?**

Then invite the player to change the Prompt and immediately test the hypothesis.

### 3.4 An Agent testbed underneath the game

The same environment can measure real Agent-system properties:

- decision latency;
- time to first action;
- time to correct action;
- token usage;
- cost;
- decision quality;
- tool-use correctness;
- resource allocation;
- adaptation;
- memory use;
- robustness;
- communication overhead;
- multi-Agent coordination.

The important metric is not raw model TPS alone.

A more useful concept is **effective agency under real-time pressure**:

> How quickly can an Agent produce a useful action before the world changes?

A model can reason correctly but still lose because its decision arrives too late.

The game turns latency into a visible gameplay constraint:

> **Think fast or die.**

---

## 4. Why Tower Defense

Tower defense is useful because it naturally provides:

- continuous decisions rather than one-shot Q&A;
- real-time pressure;
- resource constraints;
- long-term planning;
- objective consequences;
- escalating difficulty;
- clear visual state;
- reproducible seeds;
- simple tool actions;
- an immediately understandable win/fail condition.

A spectator does not need to understand LLM evaluation.

They only need to understand:

> **How long did the AI keep the base alive?**

---

## 5. Human and AI Roles

### Human

The human writes and iterates the strategy Prompt.

Later versions may allow the human to:

- choose Prompt perks;
- select inherited lessons;
- configure Agent roles;
- choose models;
- design a swarm;
- fork or mutate successful Prompt builds.

### AI

The AI:

1. observes a compressed game state;
2. interprets the player's Prompt;
3. decides what to do;
4. invokes allowed game tools;
5. observes the consequences;
6. repeats until victory or death.

The AI should make **strategic decisions**, not control every animation frame.

The deterministic game engine handles:

- movement;
- targeting;
- damage;
- projectiles;
- pathfinding;
- tower attack loops;
- frame-by-frame simulation.

---

## 6. MVP

The hackathon MVP should prove one thing:

> **Changing the Prompt causes visibly different AI strategy and visibly different game outcomes.**

### One map

A simple fixed route with a small number of build positions.

### Three enemy types

- Normal
- Fast
- Tank

### Three tower types

- Single-target damage
- Area-of-effect damage
- Slow / crowd control

### Minimal Agent tools

Conceptually:

```
inspect_game()
build_tower(type, position)
upgrade_tower(id)
sell_tower(id)
```

### Player interface

One major input:

**YOUR STRATEGY PROMPT**

Then:

**START RUN**

Once the run begins, the human does not directly control the battlefield.

### Agent decision loop

The game itself runs normally at browser-game speed.

The LLM is called only periodically or on meaningful events, for example:

- wave starts;
- enemy composition changes;
- enough gold becomes available;
- base becomes threatened;
- a major tactical condition changes.

The LLM receives a compressed game state and returns a structured action.

This avoids trying to use an LLM as a 30/60 FPS controller.

---

## 7. The MVP Magic Moment

The most important experiment should happen before visual polish.

Run the exact same map and random seed with two Prompts.

### Prompt A

> Spend aggressively. Maximize damage immediately.

### Prompt B

> Keep 30% of gold in reserve. Prioritize slowing fast enemies before adding more damage.

If a spectator can visibly see the two AIs behave differently, the core idea works.

The desired reaction is:

> **“I changed one sentence and it actually changed how the AI played.”**

That is the project's primary magic moment.

---

## 8. Roguelike Loop

The first version does not need a complex item or relic system.

A minimal roguelike loop is enough:

1. Player writes Prompt.
2. AI fights.
3. AI dies.
4. Game shows a short postmortem.
5. Player edits the Prompt.
6. Same or comparable challenge is replayed.
7. Player tries to survive longer.

Later, Prompt instructions themselves can become roguelike perks.

Examples:

### EMERGENCY FUND

> Keep 25% of available gold in reserve.

### THREAT FIRST

> Prioritize enemies by time-to-base rather than HP.

### REFLEX

> If threat ETA is below 3 seconds, act immediately instead of performing long strategic deliberation.

### REFLECT

> After each wave, identify the largest tactical mistake.

These are not fake RPG statistics. Equipping a perk actually modifies the Agent's instruction stack.

Therefore:

> **Prompt is the build.**

---

## 9. Multi-Agent / Swarm Direction

The MVP should begin with one Agent.

Once the single-Agent loop works, it can expand into a swarm.

Possible roles:

- **Scout** — observes enemy composition and threats;
- **Builder** — executes tower placement and upgrades;
- **Economy** — manages resource policy;
- **Commander** — coordinates strategic decisions;
- **Critic** — checks high-risk decisions;
- **Memory** — retrieves useful lessons from previous runs.

Then the same game can compare:

**Solo Agent vs Agent Swarm**

under the same map, seed, model budget, and constraints.

Possible measurements:

- wave reached;
- decision latency;
- tokens;
- cost;
- failed actions;
- communication overhead;
- survival;
- quality of adaptation.

A central question becomes:

> **Does adding more Agents actually make the system better?**

More Agents may improve parallelism and specialization, but may also introduce latency, communication overhead, conflict, and cost.

That tradeoff should be visible in the game rather than hidden in logs.

---

## 10. Longer-Term Game Mechanics

These are extensions, not MVP requirements.

### Prompt vs Prompt

Two humans use the same base model, map, seed, and budget.

The only difference is their strategy Prompt.

Their AIs fight independently and the better Prompt build survives longer.

### Prompt Cards

Casual players construct strategy using understandable cards instead of writing everything from scratch.

Advanced players can edit raw Prompt text.

### Prompt Inheritance

After death, the AI proposes lessons learned.

The player can preserve only a limited number for the next generation.

This creates a meaningful distinction between full episodic history and reusable experience.

### Prompt Evolution

Successful Prompts can be:

- forked;
- mutated;
- compared;
- crossed over;
- selected.

The Prompt becomes analogous to a genome.

### Human Architect vs AI Architect

The human designs an Agent team under a fixed compute budget.

An AI designs another.

Both fight the same challenge.

### Bring Your Own Agent

A future competitive mode could allow developers to submit their own:

- model;
- Prompt;
- Agent topology;
- memory strategy;
- tool policy.

The game then becomes an Agent arena.

---

## 11. Product Layers

The project can have three layers without requiring three separate products.

### For ordinary players

**A fun roguelike tower defense where you train an AI through language.**

### For AI beginners

**A fast way to understand how Prompt changes AI behavior.**

The player learns through immediate consequences rather than tutorials.

### For Agent builders

**A reproducible environment for experimenting with Agent architecture under real-time pressure.**

The order matters:

> **Game → Discovery → Benchmark**

Not:

> Benchmark → game-themed visualization.

---

## 12. Design Principles

### Game first

If it is not fun to iterate the Prompt and watch the AI fight, the project fails regardless of benchmark sophistication.

### Observable consequences

Every important AI decision should have a visible effect on the battlefield.

### Prompt sensitivity

Different reasonable Prompts must produce meaningfully different behavior.

### Real-time pressure

Thinking time must matter.

### Deterministic core

The underlying game simulation should be conventional, reliable, and reproducible.

### Narrow Agent action space

The Agent chooses strategy and invokes a small number of explicit tools.

### Failure is content

Bad AI decisions should be visible, understandable, and useful for the player's next attempt.

### Scope discipline

A polished one-map game with a strong Prompt → behavior → consequence loop is more valuable than a half-built platform.

---

## 13. Hackathon Scope

The target is:

> **A genuinely playable version within the hackathon.**

Priority order:

### P0 — Prove the mechanic

- deterministic tower-defense simulation;
- LLM tool calling;
- strategy Prompt input;
- Agent can autonomously play;
- two different Prompts produce visibly different behavior.

### P1 — Complete the game loop

- Start Run;
- watch AI decisions;
- Game Over;
- simple postmortem;
- edit Prompt;
- Retry;
- Wave score.

### P2 — Make AI legible

Show, without overwhelming the player:

- Agent thinking / waiting;
- current decision;
- action;
- latency;
- perhaps token usage.

### P3 — One swarm feature

Only after the above is stable.

Prefer a simple **Solo vs Swarm** comparison over a large configurable multi-Agent platform.

### P4 — Polish

- onboarding;
- visual clarity;
- reliable demo;
- fallback behavior;
- spectator-friendly presentation.

---

## 14. Working Positioning

### One sentence

> **A roguelike tower defense where your Prompt is your build and AI is your player.**

### Three-line explanation

> **Prompt is the build.**  
> **AI is the player.**  
> **Tower defense is the world.**

### Gameplay line

> **Fight → Die → Learn → Rewrite Prompt → Fight Again.**

### Educational line

> **Learn how to work with AI by watching your words change its behavior.**

### Agent-engineering line

> **Underneath the game, every run is a real-time experiment in Agent latency, decision quality, cost, adaptation, and coordination.**

---

## 15. North Star

The player is not really playing with towers.

The player is learning:

> **How do I communicate intent to an intelligence so that it can act successfully without me?**

Traditional games teach:

**Human → direct control → world**

This game explores:

**Human → intent → AI → decision → action → world**

The tower-defense environment makes that relationship visible, playable, comparable, fallible, and improvable.

The hackathon version succeeds if a player changes one sentence in their Prompt, watches the AI change its behavior, survives longer, and immediately wants to try again.
