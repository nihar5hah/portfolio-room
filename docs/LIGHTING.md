# Light and time of day

The room keeps Bangalore time. `src/Application/World/DayNight.ts` works out,
for the current moment in Asia/Kolkata:

- the sun's elevation and hour angle over Bengaluru (NOAA low-precision
  formulae), and the moon's from its phase;
- `day` (0 at night to 1 in daylight), `golden` (sunrise and sunset warmth),
  `night` (full dark, stars out), `cityLights` (share of skyline windows lit,
  busiest in the evening and thinning after midnight), `moonlight`, and
  `westSun` (direct sun through the west-facing window, afternoons only).

`paintSky` draws the window view from that: the gradient, stars, the sun or
moon at their real height and phase, soft clouds, and a two-row skyline. It
repaints once a minute. The transom above the door shows the same sky.

`Environment.lighting()` sets the room from the same state every frame, but
only touches lights and materials when something changed:

| Light                                       | Day                                 | Night                            |
| ------------------------------------------- | ----------------------------------- | -------------------------------- |
| Window spot (sun/moon)                      | warm white, strong in the afternoon | cool moonlight, scaled by phase  |
| Hemisphere fill and doorway key             | bright, daylight colours            | low, blue                        |
| Floor lamp, bedside glow, ceiling fan light | off                                 | on                               |
| Picture light and flag wash                 | low                                 | on (dimmed while on the Mac)     |
| Cove and LED strips                         | faint                               | on                               |
| TV glow                                     | softer                              | full                             |
| Environment reflections                     | full                                | lower, so dark rooms don't gleam |

The lamps come on as the daylight fades (`day` between 0.8 and 0.25), not at a
fixed hour, so they switch on around sunset whatever the season.

## Good Night

Clicking the bed eases `sleep` from 0 to 1 over about a second and a half.
Every lamp, strip, the ceiling light, the lampshade glow and the TV fade to
nothing, the curtains draw across the window, and only a little moonlight or
daylight leaks past them. Clicking again reverses it.

The old version hid the floor lamp with `visible = false`. Changing the number
of lights makes three.js recompile every lit shader, which was the one-second
freeze, and only that lamp went out. Now no light ever changes visibility, only
intensity.

## Lamp switches

Click the floor lamp or the desk lamp (an architect's lamp on the desk's back
corner, `deskLamp` in `Fixtures.ts`) to switch it. Each lamp follows the room
until clicked (on after dark, off at Good Night); a click turns it the other
way whatever the hour, so a lamp can be read by during the day or in bed after
Good Night. Good Night and waking hand both lamps back to the room. The bulb
warms up and fades over about a quarter of a second, by intensity only.

## Weather

The window shows Bangalore's actual weather: `Weather.ts` reads the same
Open-Meteo feed as the lock screen (`/api/weather`, Bengaluru). Rain, drizzle
and thunderstorms put falling rain beyond the glass and beads on it (a few
running down), and grey the sky (`paintSky` takes an overcast/rain amount):
the sun, moon and stars fade behind cloud, the skyline hazes over. Cloud cover
dims daylight through the window, so lamps come on earlier on a dark rainy
afternoon. In a storm, lightning flickers every 12–35 s (the sky, window light
and room fill flash briefly) and distant thunder follows a second or two later.
Rain plays as a soft loop under the music while it rains, quieter at the Mac.
Changes ease in over several seconds.

`?weather=rain` (or `drizzle`, `storm`, `cloudy`, `clear`) forces a look.

## Clocks

A wall clock right of the flag and the bedside clock both show Bangalore time
(the wall clock's second hand ticks like a quartz movement). Both follow
`?time=`, which now runs on from the given time instead of standing still.

## Checking a time

Add `?time=HH:MM` (Bangalore time) to the URL, e.g. `/?time=18:10` for sunset
or `/?time=21:30` for night.

## Validation

`tests/room-camera.test.mjs` checks that 9 pm IST is dark with city lights on,
noon has a high sun, about 6 pm is golden; that at 9 pm the lamps are on, Good
Night turns every practical light and glow off, closes the curtains, shuts out
most moonlight and changes no light's visibility; that waking restores them;
and that in the afternoon the lamps are off and the sun comes through the
window. In the browser, the longest frame after clicking Good Night was 90 ms
(it was about a second before).
