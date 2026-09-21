# Prompt Defense — Current Product Concept

> Status: confirmed product direction as of 2026-09-21.
> This document records only decisions that have been made. Unresolved items are listed separately at the end.

## 1. Product Concept

**Prompt Defense** is a web-based endless roguelike tower-defense game in which the human does not directly control the battlefield.

The human writes and updates natural-language strategy Prompts. An AI player observes the game state and operates the tower-defense game according to those instructions.

The core relationship is:

**Human intent → Prompt → AI decision → game action → battlefield consequence**

The core player fantasy is: **“I teach the AI how to play, then watch whether my strategy survives.”**

The game is intended to be playable by people at the hackathon directly in a web browser, including on-site participants, rather than existing only as a judge-facing demo.

## 2. Target Experience

The long-term target audience is teenagers / young people learning how to interact with AI.

The game should attract them as a game first. The learning outcome comes from repeatedly instructing an AI, observing what it actually does, and revising the strategy.

The product should not primarily feel like a Prompt Engineering course.

The underlying learning loop is:

**Intent → Instruction → Behavior → Observation → Revision**

Through gameplay, players can learn goals, context, constraints, priorities, exceptions, feedback, how general strategies differ from hard-coded instructions, and how AI behavior changes when instructions change.

Structured Prompt methods such as CO-STAR can be introduced through the learning experience, but no single Prompt framework has been selected as the game's canonical framework.

## 3. Core Game Loop

A formal run begins when the player spends one Coin.

**1 Coin = 1 Run / one life**

During that run:

1. The player gives the AI an initial strategy Prompt.
2. The AI plays the tower-defense game autonomously.
3. Waves continue and become increasingly difficult.
4. The player observes the battlefield and the AI's behavior.
5. While the run is still alive, the player may update the strategy by writing a new Prompt.
6. The updated strategy affects subsequent AI decisions.
7. The process continues until the base is destroyed.
8. The player's score is the highest Wave reached in that run.

The Prompt is therefore **not locked at the beginning of a run**. A run can contain Prompt v1 → Prompt v2 → Prompt v3 → ... → Base destroyed.

This makes the game about ongoing human–AI collaboration rather than writing one perfect instruction before play begins.

## 4. Endless Roguelike Tower Defense

The tower-defense foundation must support **endless Waves**. There is no fixed final level. Difficulty continues increasing until the player's defense fails.

The game also contains roguelike randomness. The same strategy does **not** have to produce the same result on every run.

**Prompt determines strategy / policy. RNG determines the situations the strategy encounters.**

A good Prompt should therefore express reusable decision rules rather than memorize a fixed sequence of Waves.

Example:

- Brittle instruction: “At Wave 5, upgrade the Cannon.”
- General strategy: “When a high-HP enemy appears, prioritize high single-target damage.”

The roguelike environment makes this difference observable.

## 5. Human and AI Roles

### Human

The human is the AI's strategist / trainer. The human writes the strategy Prompt, watches the AI play, observes failures and changing battlefield conditions, updates the Prompt during an active run, and decides how to communicate goals, constraints, priorities and exceptions.

The human does **not** directly operate the towers during normal play.

### AI

The AI is the battlefield player. It receives the player's current strategy Prompt, observes the current game state, decides what tower-defense actions to take, executes only actions exposed by the game, and continues acting as the game evolves.

The conventional game engine, not the LLM, handles frame-by-frame simulation such as enemy movement, tower attacks, damage and animation.

## 6. Tutorial / First-Time Experience

A first-time player must see an example Prompt before being expected to write one independently.

The tutorial should demonstrate that a Prompt can contain different kinds of instructions, such as a goal, strategy, resource constraints, priorities and special-case rules.

The essential tutorial outcome is:

**The player changes an instruction and then sees the AI behave differently in the game.**

This establishes the causal model:

**My words changed the AI's behavior.**

After the player understands the basic interaction, the game can progressively introduce more sophisticated Prompt structures and strategies.

The exact tutorial scenario and progression are not yet fixed.

## 7. Mid-Run Strategy Updates

Strategy updates are a confirmed part of the game.

A player must be able to observe an active run and decide that the AI needs new instructions. The system should preserve the strategy evolution of a run rather than storing only its final Prompt.

Conceptually:

Run
- Prompt v1 — active from Wave ...
- Prompt v2 — active from Wave ...
- Prompt v3 — active from Wave ...
- Final result

This history can later support post-run learning and inspection of strong leaderboard runs.

The exact cost, cooldown, timing or limits for changing Prompt during a run are unresolved.

## 8. Coin

The game uses the metaphor **INSERT 1 COIN**.

A Coin represents one attempt / one life in the endless tower defense. Spending a Coin starts a formal run. If the base is destroyed, that run ends. Starting another run requires another Coin.

For the hackathon, Coin is a game mechanic and **does not imply real-money payment**.

The exact initial Coin allocation and replenishment mechanism are unresolved.

## 9. Score and Leaderboard

The primary score is **Wave Reached**.

The web game has a shared leaderboard so hackathon participants can compare their runs.

The leaderboard is based on run performance, while acknowledging that roguelike randomness means a single best run is not a scientific measurement of Prompt quality.

Players should be able to inspect other players' successful strategies / Prompt history so that competition also creates peer learning.

The resulting social loop is:

**Play → Rank → Inspect → Learn → Change Strategy → Try Again**

The exact ranking formula, tie-breaking rules and amount of Prompt information exposed are unresolved.

## 10. Web / On-Site Experience

The product is a **web game**.

The hackathon version should allow people at the venue to participate directly from their own browser rather than requiring installation.

The desired on-site loop is:

Open game → understand “I teach the AI” → play / spend a Coin → AI fights → update strategy when needed → run ends → score appears → leaderboard → see other strategies → try again.

A shared live leaderboard is part of the product concept.

## 11. Core Product Magic Moment

The project's central proof is:

**A player changes the Prompt, the AI changes its behavior, and the battlefield visibly changes as a consequence.**

This should be observable both between different runs and after a strategy update during the same run.

If Prompt changes do not create legible behavioral differences, the core product does not work.

## 12. Product Positioning

Current concise formulation:

**Prompt is your strategy. AI is your player. Tower defense is the world.**

Player-facing formulation:

**Teach your AI. Send it into battle. See how far it survives.**

The deeper educational proposition is that the player learns how to communicate intent to an autonomous AI by watching instructions become actions and revising them based on real outcomes.

## 13. Current MVP Boundary

The MVP must establish:

- a web-based tower-defense game;
- endless Waves;
- roguelike/randomized encounters;
- an AI that autonomously operates the game;
- a player-editable strategy Prompt;
- Prompt updates during an active run;
- visible AI actions and battlefield consequences;
- one Coin per formal run;
- Wave Reached as the primary score;
- a shared leaderboard for participants;
- a first-time tutorial containing an example Prompt;
- the ability to learn from other players' successful strategies.

The first engineering milestone is to obtain a simple open-source web tower-defense foundation that can support endless play and can be adapted for AI control.

**No tower-defense repository has been selected yet.**

# Open Questions / Legacy Decisions

The following items have **not** been decided and must not be treated as requirements yet.

### Tower-defense foundation

- Which open-source web tower-defense project should be used?
- Whether to adapt an existing endless game or convert a simpler finite game to endless mode.
- Exact map design.
- Fixed route vs other pathing model.
- Exact tower types and enemy types.
- Tower placement model.
- Difficulty scaling formula.
- RNG / seed design.

### Agent runtime

- Which LLM/model/provider to use.
- Exact GameState schema.
- Exact action/tool schema.
- How often the AI is allowed to make decisions.
- Whether decisions happen per Wave, event-driven, or through another cadence.
- How model latency should affect gameplay.

### Prompt system

- Exact Prompt length/budget.
- Whether Prompt updates have a cooldown, limited charges, resource cost or Wave restriction.
- Whether the game adopts a custom Prompt framework.
- How CO-STAR or other Prompt frameworks are taught.
- Exact strategy-history UI.
- Whether players can fork/copy another player's Prompt.

### Tutorial

- Exact tutorial Waves.
- Whether the tutorial intentionally kills the AI or allows the player to intervene before failure.
- Exact example Prompt.
- Exact teaching progression.

### Coin economy

- Number of starting Coins.
- Coin replenishment.
- Whether Coin ever becomes a monetization mechanic.

### Leaderboard

- Whether ranking is purely Best Wave or includes additional modes.
- Tie-breaking.
- How randomness is represented.
- Whether average/median performance is shown.
- How much of a player's Prompt / Prompt history is public.
- Replay requirements.
- Anti-cheat / run-verification design.

### Identity and backend

- Nickname-only vs account.
- Persistence mechanism.
- Database choice.
- Backend stack.
- Hosting/deployment.
- Mobile/desktop UI details.

### Future scope — not currently MVP

The following ideas have been discussed but are not current MVP commitments:

- Multi-Agent / Swarm;
- Solo vs Swarm;
- Prompt cards;
- Prompt inheritance / memory;
- Prompt evolution;
- Prompt vs Prompt competition;
- Bring Your Own Agent;
- multi-model competition;
- advanced Agent benchmarking.
