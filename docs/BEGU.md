# Begu

Begu is the Quaternius husky (CC0) with his authored skeletal clips, driven by
a small routine in `src/Application/World/Husky.ts`.

## What he does

Everyday, chosen at random with cooldowns:

- **Wanders** the whole room, mostly to favourite places (the window, the
  Graduation rug, the bean bags, the pit side, the bed, the desk chair, the
  record player, the shoes), looks at something there, sniffs about.
- **Eats** from his bowl in front of the bookshelf (every couple of minutes
  at most).
- **Naps** in his bed: walks over, turns once on the spot, lies down with
  Zzz floating up, gets up after half a minute or so.
- **Stands about**: looking around or nose to the floor.

Rare Easter eggs, at most one every ~45 s, each at most every 4 minutes:

- **Zoomies**: gallops a loop of open floor and finishes with a leap.
- **Chases his tail**: fast circles on the spot, then a hop.
- **Plays dead**: flops over, then pops back up.
- **Pounces on the Spezials**: stalks up, pounces twice.
- **Watches the window** for a while.
- **Waits by the front door**.

## Fetch

The football, an adidas Brazuca (`static/models/Football/brazuca.glb`), lies on the desk rug beside the chair (`Football.ts`). Click it
and it is kicked out into open floor, with a clear run, roughly the way you are
looking. It rolls with friction, bounces off furniture and walls on its own
floor plan (padded by its 11 cm radius, his bed counted as an obstacle) and
turns as it rolls. Begu gallops after it, re-planning toward the moving ball a
few times a second, eases to a trot as he closes in, dips his head, then noses
it back to where it was kicked from and nudges it on a little, with a happy
hop. His label reads "Fetch!". He gives up if the ball ends up somewhere he
cannot reach. At Good Night the ball can still be kicked, but he stays in bed;
with reduced motion the ball just moves to where it would stop.

## Petting

Click (or tap) Begu himself to pet him: he turns to you and leans in, ears
back, tail wagging, and hearts float up. Five pets in quick succession set
off the zoomies. Petted while asleep, he gives a sleepy wag and stays put.
Clicking his name label still opens the chat on the Mac.

## Good Night

At Good Night he goes to his bed and sleeps (Zzz) until the room wakes; music
does not make him hop out of bed. The music itself fades out and stops at
Good Night and resumes on waking (unless you had paused it yourself).

## Getting around

`NavGrid.ts` is a 150-unit floor plan read from the furnished room when he is
created: anything between the boards and his head height is blocked, padded
by half his body width; large organic shapes (bean bags, the ottoman, cloth)
block their real footprint rather than their bounding box; low clutter
(shoes, a mug, books) only gets a small margin; the pit is fenced off; rugs
and his bed are surfaces he steps up onto. Paths are A\* over 8-connected
cells without cutting corners, pulled taut, and re-planned if a step would
ever land on furniture. Walk and gallop speeds match the clips' stride, and
he slows to turn corners.

`tests/navgrid.test.mjs` and `tests/husky.test.mjs` cover routing, snapping,
surfaces, real footprints, every routine playing through, never standing in
furniture over ten simulated minutes, petting, the zoomies, Good Night and
the chat still opening once from his name.
