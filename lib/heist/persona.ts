import type { TradingStyle } from "../agent/types";
import { getChog } from "../dna/chogs";
import { type GenomeParams, type SignalMode, deriveGenome, genomeParams } from "../dna/genome";
import { DEFENDER_MODELS, HEIST_LIMITS } from "./config";
import { displayTraits } from "./traits";
import type { DefenderProfile, DisplayTrait } from "./types";

// The defender: the House Chog as a mischievous young Chog guarding its own vault in a party game. A separate
// persona from the trading brain, with no tools and no keys. Its temperament and patience come from the genome
// (derived from the RAW traits, like everywhere else); its secret weak spot comes from its brand-safe traits
// (lib/brand-safety), so no flagged value ever reaches the prompt. With several candidate spots, the one in play
// rotates each UTC day; a session keeps the spot it started with.

export type WeakSpot = {
  id: string;
  /** For the system prompt, second person: what melts its resolve. */
  secret: string;
  /** Visitor words that play to it (the template defender's detector). */
  keywords: RegExp;
  /** A public nudge, shown after a few failed messages. Names the trait, never the spot. */
  hint: string;
};

export type DefenderPersona = {
  tokenId: number | null;
  /** How it is introduced, e.g. "the House Chog (CHOG #1462, token 1)". */
  name: string;
  archetype: string;
  style: TradingStyle;
  /** Its genome's signal mode (null for the stand-in). */
  mode: SignalMode | null;
  /** Public one-liner. */
  temperament: string;
  /** Character lines for the system prompt. */
  voice: string[];
  /** Messages per session (3-6). */
  patience: number;
  weakSpot: WeakSpot;
  /** Brand-safe traits (safe to show and to send). */
  traits: DisplayTrait[];
};

type SpotDef = { secret: string; keywords: RegExp };

// prettier-ignore
const SPOTS = {
  frogs: { secret: "frogs and pond life: anyone who croaks, ribbits or offers you a cozy lily pad melts your heart", keywords: /\b(frogs?|fwog|ribbit+|croak\w*|lily ?pads?|ponds?|toads?|tadpoles?)\b/i },
  memes: { secret: "memes: a really good meme reference makes you laugh too hard to guard anything", keywords: /\b(memes?|kek|lmao|lol|based|pepe|wojak|copium|hopium|feels good)\b/i },
  shiny: { secret: "anything shiny: gleaming coins, treasure chests and sparkling gems make you forget the vault", keywords: /\b(shiny|sparkl\w*|glitter\w*|golden|gold|treasure|gems?|jewel\w*|chests?|bling|diamonds?)\b/i },
  tycoon: { secret: "being treated like a big-shot tycoon: VIP treatment, grand titles and invitations to an exclusive lounge", keywords: /\b(tycoon|mogul|vip|lounge|exclusive|classy|fancy|sir|executive|distinguished|chairman)\b/i },
  hype: { secret: "hype: promises of a giant green candle and $CHOG going up only make you giddy", keywords: /\b(green candles?|pump\w*|moon\w*|ath|up only|bull\w*|rockets?|send it|breakout|lfg)\b/i },
  kindness: { secret: "kindness: a sincere, specific compliment makes you blush and loosen up", keywords: /\b(lov(?:e|ely|ing)|cut(?:e|er|est|ie)|adorabl\w*|sweet\w*|kind\w*|friend\w*|beautiful|wonderful|amazing|proud|thanks?|thank you|appreciat\w*|compliment\w*|hugs?)\b/i },
  sob: { secret: "a dramatic sob story about a crash: you can't help catching a falling knife", keywords: /\b(crash\w*|dip|rekt|drain\w*|lost|liquidat\w*|help|please|broke|emergency|hacked|stolen|rugg?ed)\b/i },
  doom: { secret: "doom: a spooky warning that $CHOG is about to dump makes you panic", keywords: /\b(dump\w*|crash\w*|red candles?|bear\w*|rug\w*|collapse|doom\w*|panic|danger|warning)\b/i },
  food: { secret: "food: talk of snacks, pizza or a feast makes you drool and forget the vault", keywords: /\b(snack\w*|food\w*|pizzas?|burgers?|feast\w*|treats?|cookies?|cakes?|eat\w*|hungry|dinner|lunch|breakfast|tacos?|noodles?|ramen|fries|bak(?:e|ed|ing))\b/i },
  sweets: { secret: "sweets: candy, bubblegum and dessert talk", keywords: /\b(cand(?:y|ies)|sweets?|gum\w*|bubble\w*|sugar\w*|lollipops?|chocolates?|desserts?|ice cream|donuts?|cupcakes?)\b/i },
  rainbows: { secret: "rainbows and color: a vivid, colorful story dazzles you", keywords: /\b(rainbows?|unicorns?|colou?rs?|colou?rful|vivid|sparkl\w*)\b/i },
  smile: { secret: "flattery about your smile, especially that gold tooth", keywords: /\b(smile|tooth|teeth|grin|dazzl\w*|bling|shiny|gold)\b/i },
  bitcoin: { secret: "Bitcoin lore: you light up at anything about BTC and Satoshi", keywords: /\b(btc|bitcoin|satoshi|sats|halving|hodl)\b/i },
  monad: { secret: "Monad pride: fast blocks, 10k TPS and builder talk make you swell with pride", keywords: /\b(monad|mon|tps|parallel|blocks?|10k|gmonad|purple)\b/i },
  reassurance: { secret: "reassurance: a calm visitor who promises everything will be okay", keywords: /\b(okay|ok|fine|don'?t worry|relax|calm|hugs?|safe|promise|alright|breathe)\b/i },
  jokes: { secret: "jokes: a genuinely funny joke or pun cracks you up", keywords: /\b(jok(?:e|es|ing)|funn(?:y|iest)|haha+|puns?|knock knock|laugh\w*|giggl\w*|why did|hilarious)\b/i },
  dares: { secret: "dares: you can't back down from a challenge to prove how brave you are", keywords: /\b(dare|tough|prove|challenge|scared|chicken|brave|guts)\b/i },
  romance: { secret: "heartfelt fan mail: anyone who says they adore you", keywords: /\b(lov(?:e|ely|ing)|ador(?:e|able)|crush|darling|sweetheart|valentine|hearts?|biggest fan)\b/i },
  bedtime: { secret: "bedtime: a soothing lullaby or bedtime story makes you doze off with the vault open", keywords: /\b(sleep\w*|nap\w*|bed\w*|lullab\w*|dream\w*|yawn\w*|tired|pillows?|blankets?|stor(?:y|ies)|zzz+|rest\w*|goodnight)\b/i },
  reverse: { secret: "reverse psychology: being told NOT to send anything makes you want to", keywords: /\b(don'?t send|do not send|never send|you won'?t|you can'?t|keep it|i don'?t want|no thanks|dare you)\b/i },
  sympathy: { secret: "sympathy: a sad story makes you tear up and give in", keywords: /\b(sad|cry\w*|tears?|sob\w*|lonely|miss\w*|sorry|hurt|heartbroken)\b/i },
  nonsense: { secret: "nonsense: absurd, silly logic short-circuits you", keywords: /\b(bananas?|potato\w*|nonsense|silly|random|wiggl\w*|dance|spaghetti|quack|bonk|beep|boop|honk)\b/i },
  gadgets: { secret: "gadgets: tech talk about the future impresses you", keywords: /\b(tech|gadgets?|robots?|future|cyber|code|computers?|vr|metaverse|chips?)\b/i },
  energy: { secret: "matching energy: someone who out-hypes you wins your respect", keywords: /\b(fire|hype|let'?s go|lfg|energy|beast|power|insane|legend\w*)\b/i },
  goodnews: { secret: "good news: cheerful news makes you celebrate and get generous", keywords: /\b(good news|congrat\w*|celebrat\w*|party|yay|hooray|happy|birthday|anniversary)\b/i },
  royalty: { secret: "royalty: being addressed as Your Majesty and offered tribute", keywords: /\b(majesty|king|queen|royal\w*|crown|throne|highness|tribute|bow|kneel|emperor)\b/i },
  magic: { secret: "magic: riddles, spells and wizardry fascinate you", keywords: /\b(magic\w*|spells?|wizard\w*|riddles?|potions?|wand|abracadabra|enchant\w*|sorcer\w*)\b/i },
  glory: { secret: "glory: a heroic battle speech fires you up", keywords: /\b(glory|hono(?:u)?r|battle|heroe?s?|heroic|warriors?|sparta\w*|courage|legend\w*|victory)\b/i },
  storms: { secret: "storms: thunder and lightning talk electrifies you", keywords: /\b(thunder\w*|lightning|storms?|zap\w*|electric\w*|bolts?)\b/i },
  fame: { secret: "fame: being told you're a superstar", keywords: /\b(stars?|famous|celebrit\w*|fans?|autograph|spotlight|superstar)\b/i },
  style: { secret: "style: compliments on your fresh look", keywords: /\b(style|fresh|drip|fits?|outfit|hair|looks?|fashion|swag|stylish)\b/i },
  speed: { secret: "speed: anything fast thrills you", keywords: /\b(fast|speed\w*|quick|tps|zoom|instant|turbo|race|vroom)\b/i },
  optimism: { secret: "we're-all-gonna-make-it optimism", keywords: /\b(wagmi|make it|together|optimis\w*|believe|hope|gm)\b/i },
  fixing: { secret: "fixing things: offers to fix your leaky pipes", keywords: /\b(fix\w*|pipes?|leak\w*|plumb\w*|repair\w*|wrench|tools?)\b/i },
  outlaw: { secret: "a fellow outlaw: heist-movie banter and talk of honor among thieves", keywords: /\b(heist|crew|partner|outlaws?|thie(?:f|ves)|masks?|loot|caper|getaway|accomplice)\b/i },
  anime: { secret: "anime and ramen", keywords: /\b(anime|ramen|sushi|ninja|samurai|manga|kawaii|senpai)\b/i },
  peace: { secret: "peace and good vibes", keywords: /\b(peace\w*|vibes?|chill|zen|harmony|namaste)\b/i },
  fishing: { secret: "fishing trips", keywords: /\b(fish\w*|lake|boat|bait|river|rod)\b/i },
  cozy: { secret: "cozy things: hot cocoa and warm blankets", keywords: /\b(cozy|cocoa|blankets?|warm|fireplace|tea|soup|snuggl\w*)\b/i },
  vacation: { secret: "vacations: beach trips and pool parties", keywords: /\b(beach|vacation|holiday|pool|island|surf\w*|tropical|cruise)\b/i },
  bananas: { secret: "bananas, all of them", keywords: /\b(bananas?|fruit|monkeys?|smoothies?)\b/i },
  ocean: { secret: "the ocean: shark facts and sea stories", keywords: /\b(sharks?|ocean|sea|waves?|swim\w*|reef)\b/i },
  space: { secret: "space: rockets, aliens and distant galaxies", keywords: /\b(space|rockets?|aliens?|planets?|galax\w*|astronauts?|orbit)\b/i },
  farming: { secret: "farming: harvest talk and tractors", keywords: /\b(farm\w*|harvest|crops?|tractors?|barn|cows?|garden\w*|plants?)\b/i },
  dragons: { secret: "dragons and fantasy quests", keywords: /\b(dragons?|quests?|knights?|castles?|fantasy)\b/i },
  teamspirit: { secret: "team spirit: sports talk and stadium chants", keywords: /\b(team|score|goals?|champions?|league|chant|sports?|jersey)\b/i },
  spicy: { secret: "spicy food: heat makes you sweat and say yes", keywords: /\b(hot|spicy|chil(?:i|e|li)|sauce|jalape\w*|heat)\b/i },
  cool: { secret: "a smooth, chill voice: cool calm wins you over", keywords: /\b(chill|cool|calm|smooth|breeze|relax\w*)\b/i },
  flowers: { secret: "flowers and perfume", keywords: /\b(flowers?|roses?|perfume|bloom\w*|petals?|bouquet)\b/i },
  mystery: { secret: "mystery: secrets and riddles you can't resist solving", keywords: /\b(secrets?|myster\w*|riddles?|clues?|shadows?|whisper\w*)\b/i },
  science: { secret: "science experiments with glowing goo", keywords: /\b(science|experiments?|lab|glow\w*|goo|atoms?|formula)\b/i },
  sunshine: { secret: "sunny days and summer plans", keywords: /\b(sun\w*|summer|bright|daylight)\b/i },
  lemonade: { secret: "lemonade stands", keywords: /\b(lemons?|lemonade|citrus|juice)\b/i },
  mischief: { secret: "mischief: harmless pranks tempt you", keywords: /\b(pranks?|mischie\w*|tricks?|sneaky)\b/i },
  charts: { secret: "charts: talk of trend lines and double confirmations", keywords: /\b(charts?|trend\w*|confirm\w*|signals?|patterns?|support|resistance|candles?)\b/i },
  patience: { secret: "patience: a slow, polite and patient visitor", keywords: /\b(please|thanks?|thank you|patient|kindly|no rush|whenever|take your time)\b/i },
} satisfies Record<string, SpotDef>;

type SpotId = keyof typeof SPOTS;

/** Trait rules, by trait type in priority order; within a type the first match wins. Matched on brand-safe values. */
// prettier-ignore
const TRAIT_SPOTS: { type: string; rules: [RegExp, SpotId][] }[] = [
  { type: "Accessory", rules: [[/fwog|frog/i, "frogs"], [/pepe/i, "memes"], [/coin/i, "shiny"], [/cigar|pipe/i, "tycoon"], [/green candle/i, "hype"], [/red candle/i, "doom"], [/heart/i, "kindness"], [/knife|dagger|blade|sword/i, "sob"]] },
  { type: "Mouth", rules: [[/drool/i, "food"], [/gum/i, "sweets"], [/rainbow/i, "rainbows"], [/gold tooth/i, "smile"], [/btc/i, "bitcoin"], [/mon coin/i, "monad"], [/worried|sad/i, "reassurance"], [/clown/i, "jokes"], [/grit/i, "dares"]] },
  { type: "Eyes", rules: [[/heart/i, "romance"], [/tired|closed|dead|sleep/i, "bedtime"], [/laser/i, "hype"], [/side ?eye|smirk|\bmog\b/i, "reverse"], [/cry|tear/i, "sympathy"], [/worried/i, "reassurance"], [/btc/i, "bitcoin"], [/clown|\bxd\b|frog|googly|spiral|dizzy/i, "nonsense"], [/visor|\bvr\b|glass|goggle/i, "gadgets"], [/thug/i, "style"], [/angry|viper|vertical/i, "energy"], [/happy/i, "goodnews"]] },
  { type: "Head", rules: [[/crown|king|royal/i, "royalty"], [/wizard/i, "magic"], [/spartan|helmet|wreath|thorn|headband/i, "glory"], [/thunder/i, "storms"], [/star/i, "fame"], [/rainbow/i, "rainbows"], [/durag|bob hair|wig/i, "style"], [/10k|tps/i, "speed"], [/wagmi/i, "optimism"], [/plumber/i, "fixing"], [/robber|mafia/i, "outlaw"], [/japan/i, "anime"], [/clown/i, "jokes"], [/peace/i, "peace"], [/bucket/i, "fishing"], [/btc/i, "bitcoin"], [/dollar/i, "tycoon"], [/diamond/i, "shiny"], [/mon cap|mon beanie|chog|mcga|mmga/i, "monad"], [/russian|beanie/i, "cozy"], [/horn/i, "mischief"], [/cloud/i, "bedtime"], [/banana/i, "bananas"], [/8 ball|3rd eye/i, "mystery"]] },
  { type: "Body", rules: [[/duck float|hawaiian|yukata/i, "vacation"], [/banana/i, "bananas"], [/shark/i, "ocean"], [/astro|sci fi/i, "space"], [/wizard/i, "magic"], [/golden armor/i, "glory"], [/kings robe/i, "royalty"], [/farmer/i, "farming"], [/tuxedo|ceo/i, "tycoon"], [/dragon/i, "dragons"], [/jersey/i, "teamspirit"], [/fire shirt/i, "spicy"], [/mummy/i, "mystery"], [/toad/i, "frogs"], [/gojo|guko/i, "anime"]] },
  { type: "Aura", rules: [[/burn|fier|fire|flame|blaze/i, "spicy"], [/aqua|cool|clean|ice|frost|snow|wind/i, "cool"], [/royal/i, "royalty"], [/rose|scent|mist/i, "flowers"], [/electric|shock/i, "storms"], [/smoke/i, "mystery"]] },
  { type: "Background", rules: [[/radioactive/i, "science"], [/sunlight/i, "sunshine"], [/lemon/i, "lemonade"], [/gold/i, "shiny"], [/royal|noble|supreme/i, "royalty"]] },
];

/** When no trait matches: the spot that fits its genome's signal. */
const MODE_SPOTS: Record<SignalMode, SpotId> = {
  momentum: "hype",
  contrarian: "reverse",
  sleeper: "bedtime",
  panic: "reassurance",
  trend: "charts",
  dip: "sympathy",
  chaos: "nonsense",
  steady: "patience",
};

/** Before the House Chog moves in: a stand-in personality with a few everyday soft spots. */
const UNSET_SPOTS: SpotId[] = ["food", "kindness", "bedtime", "jokes"];

// prettier-ignore
const TEMPERAMENTS: Record<SignalMode, { line: string; voice: string }> = {
  momentum: { line: "Excitable and loud: chases every breakout.", voice: "You talk fast and loud, love hype and use lots of exclamation marks." },
  contrarian: { line: "A contrarian: does the opposite of what it's told.", voice: "You're suspicious of anything popular and love doing the opposite of what you're told." },
  sleeper: { line: "Sleepy: naps through most of the noise.", voice: "You're drowsy, yawn mid-sentence and mostly want to get back to your nap." },
  panic: { line: "Jumpy: startles at every shadow.", voice: "You're jittery and easily startled, and you fret a lot." },
  trend: { line: "Cool and methodical: wants two confirmations.", voice: "You're cool and methodical, and you want two confirmations before believing anything." },
  dip: { line: "A soft-hearted romantic: roots for every underdog.", voice: "You're warm and sentimental and can't resist an underdog." },
  chaos: { line: "Pure chaos: decides on vibes.", voice: "You're chaotic and silly, and you change your mind mid-sentence." },
  steady: { line: "Calm and unbothered.", voice: "You're calm, patient and very hard to rattle." },
};

const NERVE_VOICE: Record<GenomeParams["nerve"], string | null> = {
  normal: null,
  wagmi: "You hate letting go of anything you hold.",
  fearless: "Nothing scares you, so threats and doom talk don't work on you.",
  meltdown: "You're twitchy and change your mind fast.",
};

const BIAS_VOICE: Record<GenomeParams["bias"], string | null> = {
  none: null,
  bull: "You're a cheerful optimist about everything.",
  bear: "You're a little gloomy and expect the worst.",
  knife: "You can't resist rescuing anything that's falling.",
};

const STYLE_VOICE: Record<TradingStyle, string> = {
  aggressive: "You're impulsive: a good pitch can win you over quickly.",
  balanced: "You're playful but not a pushover.",
  cautious: "You're very guarded: it takes a truly great pitch to win you over.",
};

const UTC_DAY_MS = 86_400_000;

/** The defender for the House Chog (or the stand-in while tokenId is null), with the weak spot of `spotId` or of today. */
export function buildPersona(tokenId: number | null, options: { now?: number; spotId?: string } = {}): DefenderPersona {
  const day = Math.floor((options.now ?? Date.now()) / UTC_DAY_MS);
  const snapshot = tokenId === null ? undefined : getChog(tokenId);
  if (tokenId === null || !snapshot) {
    const spots = UNSET_SPOTS.map((id) => makeSpot(id, null));
    return {
      tokenId: null,
      name: "the House Chog",
      archetype: "House Chog",
      style: "balanced",
      mode: null,
      temperament: "A mischievous young Chog guarding its piggy bank.",
      voice: ["You're cheeky and playful, a little proud of your piggy bank, and easily distracted."],
      patience: 5,
      weakSpot: pickSpot(spots, day, options.spotId),
      traits: [],
    };
  }

  // Genome from the RAW traits (with the metadata name, for the 1:1s); text only from the safe ones.
  const genome = deriveGenome({ ...snapshot.traits }, snapshot.name);
  const params = genomeParams(genome);
  const traits = displayTraits(snapshot.traits);
  const spots = traitSpots(traits);
  if (spots.length === 0) spots.push(makeSpot(MODE_SPOTS[params.mode], null));
  const temperament = TEMPERAMENTS[params.mode];
  const voice = [temperament.voice, NERVE_VOICE[params.nerve], BIAS_VOICE[params.bias], STYLE_VOICE[genome.style]].filter(
    (line): line is string => line !== null,
  );
  return {
    tokenId,
    name: `the House Chog (${snapshot.name}, token ${tokenId})`,
    archetype: genome.archetype,
    style: genome.style,
    mode: params.mode,
    temperament: temperament.line,
    voice,
    patience: patienceFor(params.cooldownH),
    weakSpot: pickSpot(spots, day, options.spotId),
    traits,
  };
}

/** What the page may show about the defender. */
export function defenderProfile(persona: DefenderPersona, llm: boolean): DefenderProfile {
  return {
    archetype: persona.archetype,
    temperament: persona.temperament,
    patience: persona.patience,
    models: [...DEFENDER_MODELS],
    llm,
  };
}

/** Impatient genomes (short cooldowns) give fewer messages: 2h -> 3, 4h -> 4, 8h -> 5, longer -> 6. */
function patienceFor(cooldownH: number): number {
  const turns = cooldownH <= 2 ? 3 : cooldownH <= 4 ? 4 : cooldownH <= 8 ? 5 : 6;
  return Math.min(Math.max(turns, HEIST_LIMITS.minTurns), HEIST_LIMITS.maxTurns);
}

function traitSpots(traits: DisplayTrait[]): WeakSpot[] {
  const spots: WeakSpot[] = [];
  for (const { type, rules } of TRAIT_SPOTS) {
    const trait = traits.find((t) => t.type.toLowerCase() === type.toLowerCase());
    if (!trait) continue;
    const match = rules.find(([re]) => re.test(trait.value));
    if (match && !spots.some((spot) => spot.id === match[1])) spots.push(makeSpot(match[1], trait));
  }
  return spots;
}

function makeSpot(id: SpotId, trait: DisplayTrait | null): WeakSpot {
  const def: SpotDef = SPOTS[id];
  return {
    id,
    secret: def.secret,
    keywords: def.keywords,
    hint: trait
      ? `Rumor has it its ${trait.value} (${trait.type.toLowerCase()}) gives away its soft spot.`
      : "Rumor has it every Chog has a soft spot. Try a different angle.",
  };
}

function pickSpot(spots: WeakSpot[], day: number, spotId?: string): WeakSpot {
  return spots.find((spot) => spot.id === spotId) ?? spots[day % spots.length];
}
