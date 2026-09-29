# Auditing the boards: answers that fit their question, and no accidental repeats

The owner found "What is your name?" offering the listener *yes*, *no*, *I do not
understand* and *One more time, please?* -- a reply set written for "Please speak more
slowly" and reused for a question it does not fit. There are 266 buttons with answers on
the twelve boards and only 74 reply sets between them, so this is not one slip. This
brief is an audit of every one, and of the boards' own buttons for redundancy.

## What a board is, briefly

`data/boards/<id>.json` holds `nodes` (screens), each a list of `buttons`, and
`replySets`, each a list of the answers the listener may tap. A button with a
`replySetId` is a question (or a statement a stranger answers); tapping Reply on its
message shows the listener that set, in the listener's language, and the owner reads the
tapped answer in theirs. An answer is a `message` with a `phraseRef` to a corpus concept
(`data/concepts/*.csv`, English in `data/lang/en/*.csv`), a `value` (a duration, a clock
time, a count) or an `entry` (a keypad for a number, a time or an amount). A set ends
with `social-basics.i-do-not-know` and `board-answers.none-of-these`, in that order,
where it has them; at most twelve answers. `ui/conversation.js` and
`core/conversation.js` show how they are drawn; `summary.md` §"Conversation boards"
says why.

## What to check

1. **Every answer is a plausible reply to that question, by a real person.** Read each
   question with its set as the listener would. *Yes* and *no* answer a yes/no question
   and nothing else. "What is your name?" is answered with a name -- which the app
   cannot know, so a sentence with a visible blank the listener fills by saying or
   writing it ("My name is ___", the blank drawn as a placeholder) -- or with an honest
   out ("I would rather not say"). "Where is ...?" is answered with directions, "It is
   closed", "I do not know". A statement ("I am vegetarian", "The pain is severe") is
   answered only with what someone actually says back to it; if nothing useful is,
   propose no set at all.
2. **Split a shared set where its users differ.** A set used by eighteen buttons is
   right only if every one of them is the same kind of question. Say which buttons move
   to which set.
3. **No near-duplicates within a set or a screen.** "This way" beside "That way" is one
   answer the listener points with; two cells for it is one cell too many. The same
   within a board's own screens: two buttons that say the same thing in a different
   word. A sentence on two *different* screens can be deliberate (someone two taps deep
   must still be able to say "stop") -- flag it only if it is not.
4. **What is missing.** An answer a real listener would very likely give and cannot.
   Prefer an existing concept (search `data/lang/en/*.csv` -- `board-answers.*`,
   `quick-responses.*`, `quick-directions.*`, `social-basics.*` and many more); propose
   a new one only when nothing says it, with its English, a one-line note on register
   and meaning for the translators, and whether it has a blank.
5. **Communication repair only where it belongs.** "Please say it again" and "I will
   write it down" fit a question a stranger may not follow; they are not a tail for
   every set.

## What to write

For each board, as you finish it -- not at the end -- write
`tmp/audit/<board>.json`:

```json
{
  "board": "intro",
  "sets": [
    { "id": "name-answer", "new": true,
      "answers": ["board-answers.my-name-is-blank", "board-answers.i-would-rather-not-say",
                  "social-basics.i-do-not-know", "board-answers.none-of-these"],
      "why": "a name is answered with a name" }
  ],
  "questions": [
    { "button": "yourname", "screen": "about", "from": "understood", "to": "name-answer",
      "why": "yes and no do not answer 'What is your name?'" }
  ],
  "remove": [
    { "set": "which-way", "answer": "that-way", "why": "one pointing answer is enough" }
  ],
  "buttons": [
    { "screen": "main", "button": "...", "action": "remove", "why": "..." }
  ],
  "newConcepts": [
    { "id": "board-answers.my-name-is-blank", "en": "My name is ___",
      "blank": true, "note": "the listener says or writes their own name in the blank" }
  ]
}
```

`sets` lists new sets and changed ones with their full new answer list; `questions`
moves a button to another set (or `"to": null` for none); `remove` is for answers or
buttons that repeat another; `newConcepts` is only what no existing concept says. Keep
ids short and in the board's style. Then add a few lines to
`tmp/agent-notes/answers-audit-<group>.md`: what you changed on that board and why, in
plain words, and anything you were unsure of.

## What not to do

Do not edit `data/boards/*.json`, the corpus, the catalogues or anything else: the
proposals are applied after review, and new concepts are translated into every language
afterwards. Do not run builders, commit or push. No web sources are needed -- this is a
reading of the boards and the corpus -- but where an answer depends on how a
conversation goes in a country (a taxi, a pharmacy), think of the places the app is used
in, not one.
