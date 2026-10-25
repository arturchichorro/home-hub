import type { WorkoutExercise, WorkoutPlan } from "./workouts";

// Stable identifiers let performance remain comparable across A/C and seed copies.
const id = (n: number) =>
  `a6300000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const exercise = (
  n: number,
  name: string,
  pair: number,
  min: number,
  max: number,
  cues: string,
  load: WorkoutExercise["load"] = "per-hand",
  unilateral = false,
  unit: WorkoutExercise["unit"] = "reps",
): WorkoutExercise => ({
  id: id(n),
  name,
  pair,
  min,
  max,
  cues,
  load,
  unilateral,
  unit,
  sets: 2,
});
const squat = exercise(
  1,
  "Goblet squat",
  1,
  8,
  12,
  "Hold one dumbbell close to your chest; sit between your hips, keeping feet planted. Aim for controlled, repeatable reps.",
  "single",
);
const bench = exercise(
  2,
  "Dumbbell bench press",
  1,
  8,
  12,
  "Palms facing each other or slightly turned; wrists stacked over forearms. Lower only as far as comfortable. No need to increase weight every session.",
);
const row = exercise(
  3,
  "Bench-supported one-arm row",
  2,
  8,
  12,
  "Support your free forearm on the bench if hand support bothers your wrist. Pull toward your hip without twisting. Keep torso still; lower under control. Complete both sides for one set.",
  "single",
  true,
);
const raise = exercise(
  4,
  "Dumbbell lateral raise",
  2,
  10,
  15,
  "Soft elbows; raise slightly forward of your sides, no higher than shoulders. Don't shrug or swing. If 5 kg requires swinging, it is too heavy.",
);
const curl = exercise(
  5,
  "Dumbbell hammer curl",
  3,
  10,
  15,
  "Palms face inward; elbows near ribs, wrists straight. Controlled lowering; no body swing.",
);
export const starterWorkoutTitle = "Six-week dumbbell mornings";
export const starterWorkoutPlan: WorkoutPlan = {
  incrementKg: null,
  warmup:
    "4 minutes, about one minute each:\n1. Brisk marching with relaxed arm swings.\n2. Eight bodyweight squats, then eight unloaded hip hinges; repeat gently if time remains.\n3. Six to eight easy wall slides, then gentle elbow and wrist movements within a comfortable range. No forced wrist stretching.\n4. A light rehearsal set of the first pair. Rehearse presses unloaded if your lightest dumbbells are too heavy.",
  finish:
    "2–3 minutes:\n• Half-kneeling hip-flexor stretch: 30 seconds each side; gently tuck pelvis, don't arch your back.\n• Lying upper-back rotation: 4 slow reps each side; knees bent together, rotate upper arm and chest open without forcing.\n• Wall slides: 6 slow reps, ribs down, comfortable range.\n• Kiné wrist rehab: it can replace an accessory pair to fit inside 30 minutes.",
  guidance:
    "Three sessions per week, 25–30 minutes, initially six weeks. Example: Monday A, Wednesday B, Friday C. Ideally leave a day between sessions. If you miss one, do the next letter next time; don't cram catch-up workouts.\nEquipment: dumbbells, mat, stable bench rated for your weight plus dumbbells. No running required.\n18–21 minutes: three exercise pairs, two rounds per pair. Do exercise 1, switch for 15–30 seconds, exercise 2, then rest 45–75 seconds. Repeat once, then next pair. Allow roughly 6–7 minutes per pair; rest longer if needed, never rush technique.\nChoose weights leaving 2–3 clean reps in reserve; week one, 3–4. Start near the bottom of the rep range, gradually add reps. When both sets reach the top with good form and no symptoms, use the smallest available weight increase next time, returning toward the bottom. If the jump is too big, keep the old load. Build side planks to 30 seconds per side before a harder variation.\nLight-weight rule: if your smallest weights are too heavy for raises or triceps extensions, use lighter household weights or a light band if available. Don't force 5 kg.\nLow-energy morning: warm up, then one round of all three pairs. It counts. If climbing or running leaves you particularly tired or sore, use this version or rest.\nSix-week success: consistency, learning loads, and gradually improving repetitions—not dramatic physique change. Review volume and exercise choices after six weeks.",
  workouts: [
    {
      id: id(100),
      name: "Workout A",
      exercises: [
        squat,
        bench,
        row,
        raise,
        curl,
        exercise(
          6,
          "Dead bug",
          3,
          6,
          8,
          "Lie on your back; slowly extend opposite arm and leg. Ribs down; avoid arching your back.",
          "bodyweight",
          true,
        ),
      ],
    },
    {
      id: id(101),
      name: "Workout B",
      exercises: [
        exercise(
          7,
          "Dumbbell Romanian deadlift",
          1,
          8,
          12,
          "Knees slightly bent; send hips backward, weights close to legs. Stop before your back rounds.",
        ),
        exercise(
          8,
          "Seated dumbbell overhead press",
          1,
          8,
          12,
          "Sit firmly on bench; palms inward. Press without leaning back or forcing overhead range.",
        ),
        exercise(
          9,
          "Stationary split squat",
          2,
          6,
          10,
          "Staggered stance; lower straight down within comfortable range. Start without weights; use light support for balance.",
          "per-hand",
          true,
        ),
        row,
        exercise(
          10,
          "Lying dumbbell triceps extension",
          3,
          10,
          15,
          "Lie on mat, palms inward. Upper arms vertical; bend elbows to lower weights beside your head, then straighten. Use light weights.",
        ),
        exercise(
          11,
          "Forearm side plank",
          3,
          15,
          30,
          "Elbow under shoulder; hips lifted, breathe. Start with knees bent if needed.",
          "bodyweight",
          true,
          "seconds",
        ),
      ],
    },
    {
      id: id(102),
      name: "Workout C",
      exercises: [
        squat,
        bench,
        row,
        raise,
        curl,
        exercise(
          12,
          "Reverse crunch",
          3,
          8,
          12,
          "Lie on your back, knees bent. Gently curl pelvis off mat; don't throw legs overhead.",
          "bodyweight",
        ),
      ],
    },
  ],
};
