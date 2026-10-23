/* wordlist.js
 * A big pool of common, kid-friendly, lowercase English words (letters only,
 * no punctuation). Word stages filter this list down to whatever letters
 * the player has unlocked so far, and to a target length range.
 */

const MASTER_WORDS = [
  // 2-letter
  'as','ad','ah','al','ha','hah','la','ha',
  // home-row-friendly (a s d f g h j k l)
  'dad','sad','lad','gag','gal','had','has','lag','sag','ash','gash',
  'flag','gall','fall','hall','half','lash','dash','gash',
  'salad','flask','flags','glass','class','shall','small','slash',
  'add','ads','gas','dash','sag','all','gals','dads','lads',
  'alfalfa','ask','asks','lass',
  // short common words (2-4 letters, broad)
  'at','an','am','is','it','in','on','up','go','no','so','we','me','he',
  'be','do','if','or','ox','of','to','us','my',
  'cat','dog','bat','hat','mat','rat','sat','pat','van','net','pen',
  'pig','hen','fox','cup','sun','fun','run','bun','hug','bug','jug',
  'bed','red','ten','men','leg','log','jog','mop','top','pop','hop',
  'hot','pot','not','dot','cot','got','let','get','set','wet','net',
  'pin','win','fin','tin','bin','dig','fig','big','wig','zip','rip',
  'lip','tip','hip','sip','dip','kit','sit','fit','bit','hit','lit',
  'cap','map','tap','lap','nap','gap','jam','ham','ram','yam','dam',
  'can','man','fan','pan','tan','van','yes','yet','yak','web','wag',
  'tag','bag','rag','sag','zig','zag',
  'ball','bell','call','doll','tall','wall','mall','hall','fall',
  'bird','fish','frog','duck','bear','lion','wolf','deer','goat',
  'book','cook','look','took','rock','sock','lock','dock','mock',
  'milk','silk','desk','disk','pink','sink','rink','wink','link',
  'jump','bump','lump','dump','pump','camp','lamp','damp','ramp',
  'band','hand','land','sand','wand','bend','lend','send','tend',
  'nest','best','rest','test','vest','west','just','must','dust',
  'fast','last','mast','past','cast','vast','gift','lift','soft',
  'kind','mind','find','wind','bind','hind',
  'blue','pink','gray','gold','pale','navy',
  'frog','crab','wasp','worm','seal','swan','hawk','mole','mule',
  'tree','leaf','root','stem','bark','seed','vine',
  'star','moon','rain','snow','wind','cloud','storm',
  'lake','pond','river','ocean','creek',
  'hill','rock','sand','cave','peak',
  'kite','ball','game','park','swim','bike','ride','walk','jump',
  'read','book','page','word','letter','story',
  'play','sing','draw','paint','dance','laugh','smile',
  'happy','funny','silly','jolly','proud','brave','kind',
  'apple','mango','grape','lemon','melon','peach','berry','plum',
  'bread','toast','juice','candy','pizza','taco','donut',
  'house','mouse','horse','mouse','fence','bench','table','chair',
  'plant','grass','flower','garden',
  'puppy','kitty','bunny','lamb','chick','duckling',
  'happy','smile','laugh','giggle','dream','sleep','wake','rise',
  'friend','family','mother','father','sister','brother','cousin',
  'school','teacher','student','pencil','crayon','paper','desk',
  'yellow','orange','purple','green','brown','black','white',
  'summer','winter','spring','autumn','season','weather',
  'wonder','magic','sparkle','shine','glow','glitter',
  'rabbit','turtle','spider','monkey','tiger','zebra','panda','camel',
  'dragon','castle','wizard','knight','pirate','rocket','robot','planet',
  'rainbow','butterfly','elephant','dinosaur','octopus','penguin',
  'balloon','bubble','cookie','pancake','sandwich','popcorn',
  'adventure','treasure','mountain','waterfall','sunshine','firefly',
  'alphabet','computer','keyboard','notebook','backpack',
];

function uniqueSorted(list) {
  return Array.from(new Set(list.map((w) => w.toLowerCase())));
}

const ALL_WORDS = uniqueSorted(MASTER_WORDS);

/**
 * Returns words usable with the given set of unlocked letters, within a
 * length range (inclusive). allowedLetters should NOT include space.
 */
function wordsFor(allowedLetters, minLen, maxLen) {
  const allowedSet = new Set(allowedLetters.map((c) => c.toLowerCase()));
  return ALL_WORDS.filter((w) => {
    if (w.length < minLen || w.length > maxLen) return false;
    for (const ch of w) {
      if (!allowedSet.has(ch)) return false;
    }
    return true;
  });
}
