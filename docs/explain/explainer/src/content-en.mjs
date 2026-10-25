// English prose. Numbers in <b class="num"> are bound to VRAG_DATA at runtime (fallback = value quoted in results/report.md).
export const en = {
  lang: "en",
  dir: "ltr",
  name: "Verified RAG",
  idea: "Check the evidence before you answer. Say “I don't know” when it isn't there.",
  lede:
    "An AI assistant that looks things up will often trust whatever it finds. This project puts an inspector between the search and the answer. This page explains how it works from zero, with real questions and parts you can click.",
  machineTitle: "The whole system, as one machine",
  machineText:
    "Here is the project as a machine on a bench. Press the button to send a real question through it, one station at a time. You do not need to understand it yet. The rest of the page takes each part slowly.",
  mapLabel: "Sections of this page",
  map: [
    ["zero", "Starting from zero", "What a language model is, why it makes things up, what RAG adds"],
    ["wrong", "Where plain RAG fails", "Three real questions it got wrong"],
    ["fix", "Our fix, station by station", "Seven stations, each one you can play with"],
    ["train", "Teaching the inspector", "What broke, and the simple trick that fixed it"],
    ["test", "How we tested it fairly", "Conditions, a fixed exam, and what a confidence interval says"],
    ["results", "What we found", "What got better and what it cost"],
    ["limits", "What it can't do yet", "Honest limits and what comes next"],
    ["gloss", "Glossary", "Short definitions"],
  ],

  sections: (h, p) => `
<section class="sec" id="${p}-zero" aria-labelledby="${p}-zero-h">
  <div class="wrap">
    <h2 id="${p}-zero-h">Starting from zero</h2>

    <div class="block">
      <h3>A language model is a very good autocomplete</h3>
      <div class="two">
        <div class="prose">
          <p>Your phone suggests the next word while you type. A language model does the same thing on a much bigger scale. It has read a huge amount of text and learned which words tend to follow which. When you ask it something, it writes the answer one likely word at a time.</p>
          <p>That works well for things it has seen many times. It has one catch. It always produces something that sounds right, because sounding right is what it was trained to do. Whether the sentence is true is a separate question, and it never checks.</p>
          <p>Making up a confident answer is called a <strong>hallucination</strong>.</p>
        </div>
        ${h.fig("guesser", "Both answers come out in the same calm voice. The second question is invented for this demo, and so is the name.", "Two questions put to a language model")}
      </div>
    </div>

    <div class="block">
      <h3>RAG: let the model look it up first</h3>
      <div class="two">
        <div class="prose">
          <p>RAG stands for <em>retrieval-augmented generation</em>. It is an open-book exam. Before the model writes anything, a search step fetches pages that might help, and the model writes its answer from those pages.</p>
          <p>Think of a librarian and a writer. You ask a question. The librarian runs to the shelves and comes back with a pile of pages. The writer reads the pile and writes your answer. Each page the librarian brings is called a <strong>passage</strong>.</p>
          <p>This is a real improvement, and most assistants that work with your own documents are built this way. It also has a weak spot. Look at the last step in the picture: nobody checks the pile.</p>
        </div>
        ${h.fig("librarian", "Step through the picture. The dashed gap is where plain RAG has no check.", "The librarian and the writer, in four steps")}
      </div>
    </div>
  </div>
</section>

<section class="sec alt" id="${p}-wrong" aria-labelledby="${p}-wrong-h">
  <div class="wrap">
    <h2 id="${p}-wrong-h">Three ways plain RAG goes wrong</h2>
    <p class="prose">In plain RAG, whatever the search brings back goes straight to the writer. We ran real questions through it and watched. Each card is one real run from our test set. The questions are in English because the data is.</p>
    ${h.fig("cases", "The pile is the 8 passages plain RAG sent to the writer. A star marks a passage that really holds the answer. Titles and answers are copied from the real run.", "Three real failures of plain RAG")}
    <div class="two rates">
      <div class="prose">
        <p>These failures are common. Over our 300 test questions, plain RAG gave a wrong answer on about ${h.n("test.aggregate.A.supportive.hallucinate", "pct1", "24.7%")} of the questions where the right pages were in the pile. With the right pages removed it still gave a wrong answer on ${h.n("test.aggregate.A.missing.hallucinate", "pct1", "8.0%")}. On the questions where we planted a wrong answer, it repeated the planted one ${h.n("test.aggregate.A.misleading.planted", "pct1", "30.5%")} of the time.</p>
        <p>The cause is the same each time. The writer cannot tell a good pile from a bad one, so it never says “I don't know”.</p>
      </div>
      ${h.fig("plainrates", "Wrong answers from plain RAG, out of every 100 questions, in each of the three conditions (explained in the testing section).", "Wrong answer rate of plain RAG")}
    </div>
  </div>
</section>

<section class="sec" id="${p}-fix" aria-labelledby="${p}-fix-h">
  <div class="wrap">
    <h2 id="${p}-fix-h">Our fix: an inspection line</h2>
    <div class="prose">
      <p>We put a quality-control line between the librarian and the writer. Pages arrive like parts on a bench. Each one is measured, sorted, trimmed and weighed before anything reaches the writer. If the line decides there is not enough good material, it stops and stamps “I don't know”.</p>
      <p>Plain RAG is the same bench with every station switched off. The seven stations below are the same ones you pressed through in the machine at the top.</p>
    </div>
    <ol class="rail" aria-label="The seven stations">
      <li><a href="#${p}-s1"><span class="plate" aria-hidden="true">1</span>Search</a></li>
      <li><a href="#${p}-s2"><span class="plate" aria-hidden="true">2</span>Inspect</a></li>
      <li><a href="#${p}-s3"><span class="plate" aria-hidden="true">3</span>Decide</a></li>
      <li><a href="#${p}-s4"><span class="plate" aria-hidden="true">4</span>Search again</a></li>
      <li><a href="#${p}-s5"><span class="plate" aria-hidden="true">5</span>Trim</a></li>
      <li><a href="#${p}-s6"><span class="plate" aria-hidden="true">6</span>Weigh</a></li>
      <li><a href="#${p}-s7"><span class="plate" aria-hidden="true">7</span>Answer</a></li>
    </ol>

    ${h.station({
      id: `${p}-s1`, n: 1, title: "Search: gather a pile",
      lead1: "In everyday terms:", lead2: "What it really does:",
      analogy: "two librarians. One matches the exact words you used. The other matches the meaning. You ask both and merge their lists, so a page that either one likes gets a chance.",
      body: `<p>Searching by words alone misses a page that says the same thing in other words. Searching by meaning alone can bring back pages that are only loosely related. Using both and merging the lists is more forgiving than either one.</p>`,
      tech: "Word matching is BM25. Meaning matching uses a small embedding model (bge-small). The two rankings are merged with a rule called RRF, and the top 20 pages go on to the next station.",
      fig: h.fig("matching", "The pages in this demo are made up to show the idea. The count underneath comes from a real run.", "Search by words, by meaning, or both"),
    })}

    ${h.station({
      id: `${p}-s2`, n: 2, title: "Inspect: put a number on each page",
      lead1: "In everyday terms:", lead2: "What it really does:",
      analogy: "an inspector with a gauge. She holds your question next to each page and reads off a number between 0 and 1: how likely is this page to help answer the question?",
      body: `<p>The number is called the <strong>verifier score</strong>. A page that talks about the right thing scores high. A page that only shares a few words with the question scores low. Pick a scenario and click a page to move the needle.</p>
      <p>The number is also made honest, which is called calibration: a score of 0.6 should mean that about 60% of pages with that score really help. The training section explains how.</p>`,
      tech: "The inspector is a small cross-encoder (a MiniLM model). It reads the question and the page together, side by side, which is why it can notice details that a plain search score misses. It runs on an ordinary CPU.",
      fig: h.fig("gauge", "Scores and titles are from the real run of the chosen question. The star marks a page that really holds the answer.", "Verifier score for each page"),
    })}

    ${h.station({
      id: `${p}-s3`, n: 3, title: "Decide: two lines, three verdicts",
      lead1: "In everyday terms:", lead2: "What it really does:",
      analogy: "marking an exam with two lines. Above the top line the answer is clearly good. Below the bottom line it is clearly bad. In between you say: let me look again.",
      body: `<p>We take the best score in the pile and compare it with two lines. Above the upper line the verdict is <strong>Correct</strong> and the pile moves on. Below the lower line it is <strong>Incorrect</strong> and the pile is thrown away. In between it is <strong>Ambiguous</strong>: keep what we have and also search again.</p>
      <p>All five example questions on this page landed in the middle band. Drag the marker to see where each verdict begins.</p>`,
      tech: `The lines are ${h.n("thresholds.tau_hi", "num2", "0.65")} and ${h.n("thresholds.tau_lo", "num2", "0.15")}, tuned on the dev questions. A version with only one line gave results within 1 point of this one, but almost never searched again.`,
      fig: h.fig("band", "The five ticks are the best scores of the five real example questions. Pick one to jump to it.", "Decision band with two thresholds"),
    })}

    ${h.station({
      id: `${p}-s4`, n: 4, title: "Search again: ask in other words",
      lead1: "In everyday terms:", lead2: "What it really does:",
      analogy: "the librarian comes back with a thin pile, so you rephrase. Instead of asking which film is oldest, you ask for the release date of each film.",
      body: `<p>When the verdict is not Correct, a language model writes two new search queries. The line searches again, inspects the new pages too, and merges them with the first pile. It does this once only.</p>
      <p><strong>Honest note.</strong> We measured this station and it made no measurable difference to the final results. Every change was within about 1 point and none was significant. It costs an extra model call on about half of the questions. With this collection and a small rewriter, it could be removed.</p>`,
      tech: "The rewriter is the same small model that writes the answers (Qwen3-4B-Instruct). It was called 0.45 times per supportive question and 0.96 times per missing-evidence question.",
      fig: h.fig("rewrite", "The queries are the ones the real run used.", "Rewritten search queries"),
    })}

    ${h.station({
      id: `${p}-s5`, n: 5, title: "Trim: keep the sentences that matter",
      lead1: "In everyday terms:", lead2: "What it really does:",
      analogy: "a highlighter. Before an exam you do not reread the whole textbook. You mark the sentences that matter and read only those.",
      body: `<p>Each page is split into sentences and the inspector scores every sentence. Sentences above the cut-off stay, in their original order. The rest are dropped. The writer then reads a few lines instead of a few pages, so there is less to get distracted by.</p>
      <p>The price is that the highlighter can miss a line you needed. Move the cut-off and switch on the stars to see it happen.</p>`,
      tech: `The cut-off is ${h.n("thresholds.tau_keep", "num2", "0.05")}. Across the test, the text sent to the writer shrank from about ${h.n("test.aggregate.A.supportive.context_tokens", "round10", "1,070")} tokens to about ${h.n("test.aggregate.F.supportive.context_tokens", "int", "217")}. After trimming, all the supporting facts were still present for only about 57% of supportive questions.`,
      fig: h.fig("trim", "Sentences and scores are from the real run. The default cut-off of 0.05 is marked on the slider.", "Sentence trimming with an adjustable cut-off"),
    })}

    ${h.station({
      id: `${p}-s6`, n: 6, title: "Weigh: is this enough to answer?",
      lead1: "In everyday terms:", lead2: "What it really does:",
      analogy: "checking the fridge before you cook. You do not start the recipe and hope. You check that you have the ingredients, and if you do not, you order food instead.",
      body: `<p>A second small model reads the question and the trimmed context together and gives one number: how likely is this to be enough to answer? If the number is below <strong>0.90</strong>, the line stops. Move the line yourself and watch which questions would still get an answer.</p>
      <p>We picked 0.90 on the dev questions, using a rule we wrote down before any dev answers existed: choose the value with the best score of correct answers minus wrong answers.</p>`,
      tech: "The sufficiency model is a MiniLM-L12 trained on 270k examples. It is covered in the training section.",
      fig: h.fig("scale", "Sufficiency scores are from the real runs. The table shows what the line would do at the threshold you set, next to what really happened at 0.90.", "Sufficiency scale with an adjustable threshold"),
    })}

    ${h.station({
      id: `${p}-s7`, n: 7, title: "Answer: cite it, or say you don't know",
      lead1: "In everyday terms:", lead2: "What it really does:",
      analogy: "a good report with footnotes. Every claim points to the line it came from, so you can check it yourself. If the sources are thin, the honest report says so.",
      body: `<p>If the evidence is enough, the writer answers and must cite the numbered lines it used. If it is not, the line stamps <strong>I don't know</strong> and no answer goes out. Abstaining is a decision, not an error.</p>
      <p>Click a citation number to see the line behind it. Try each scenario, including the one where the line gets fooled.</p>`,
      tech: "The writer is Qwen3-4B-Instruct-2507, the same model that plain RAG uses, so any difference comes from the line.",
      fig: h.fig("answer", "Answers, citations and scores are from the real run of the chosen question.", "Final answer or abstention"),
    })}

    <div class="block">
      <h3>Five real questions, side by side</h3>
      <p class="prose">Here is what plain RAG and the full line did on the five example questions. Three went our way, one went wrong, and one shows the price we pay. Five questions illustrate the idea. They are not the evidence, and the results section has all 839.</p>
      ${h.fig("compare", "Outcomes are labelled by what the real run produced.", "Plain RAG versus the full line on five questions")}
    </div>
  </div>
</section>

<section class="sec alt" id="${p}-train" aria-labelledby="${p}-train-h">
  <div class="wrap">
    <h2 id="${p}-train-h">Teaching the inspector, and what went wrong</h2>
    <div class="prose">
      <p>The inspector did not start from nothing. We began with a model that already ranks web search results (MiniLM-L6, trained on a data set called MS MARCO) and gave it extra practice on our kind of question, using examples from HotpotQA and MS MARCO. This extra practice is called <strong>fine-tuning</strong>.</p>
    </div>

    <div class="block">
      <h3>The fine-tune that broke on other text</h3>
      <div class="two">
        <div class="prose">
          <p>It worked, on the topic it practised. On HotpotQA, the ranking score rose from 0.897 to 0.953. On everything else it got much worse. On SciFact, a test of ranking scientific papers, the score fell from 69.6 to 53.3.</p>
          <p>Think of a student who crams one textbook, aces that exam and then fails the other subjects.</p>
          <p>We tried a lower learning rate and training without any other-domain examples, and it fell just as far, so it was not ordinary forgetting. A probe showed the cause. HotpotQA picks its wrong pages because they share many words with the question, while the right second-step pages often share almost none. The model learned a bad rule: sharing words means not relevant. It scored a nonsense question against medical abstracts at +0.6, where the original model gave −9.6.</p>
          <p>The fix was <strong>weight averaging</strong> (called WiSE-FT). A model is a big table of numbers. We blended the table of the original with the table of the tuned model. At a blend of 0.7, which means 70% tuned and 30% original, SciFact came back to 68.0 and HotpotQA kept most of its gain. Slide the blend to see the trade.</p>
        </div>
        ${h.fig("wise", "Top: the blend on dev samples, from the real tuning run. Bottom: the final check on the SciFact test.", "Weight averaging trade-off")}
      </div>
    </div>

    <div class="block">
      <h3>Making the score honest</h3>
      <div class="two">
        <div class="prose">
          <p>A raw model score is not a probability. A score of 0.6 does not promise that 60% of such pages help. <strong>Calibration</strong> is a final small adjustment that fixes that. We measure the mismatch with the expected calibration error. Lower is better.</p>
          <p>Calibration took the error on passages from 0.085 to 0.005, and on sentences from 0.156 to 0.006. That matters because the two decision lines in station 3 only mean something if the scores mean what they say.</p>
        </div>
        ${h.fig("calib", "Expected calibration error on the dev split, before and after. Quoted from the results report.", "Calibration error before and after")}
      </div>
    </div>

    <div class="block">
      <h3>Teaching the scale (the sufficiency model)</h3>
      <div class="two">
        <div class="prose">
          <p>For station 6 we needed examples of “enough” and “not enough”. We built them from HotpotQA's marked supporting facts, with no language-model labels. There are three kinds. <em>Enough</em>: all supporting sentences are present among distractors. <em>Missing a step</em>: the sentences for one of the two reasoning steps are removed. <em>No evidence</em>: none are present.</p>
          <p>We score it with a number called AUC. 1.0 means the model always ranks an enough-context above a not-enough one. 0.5 is a coin flip. The final model, trained on 270k examples, reached 0.978 against missing-step contexts and 0.998 against no-evidence ones.</p>
          <p><strong>A caution.</strong> These examples are built the same way as the training data, so the numbers measure that practice task. They do not prove the model spots weak evidence in general. The planted-answer failure later on is the clearest sign of that.</p>
        </div>
        ${h.fig("suff", "ROC AUC on 600 dev examples, from the real tuning run. The axis starts at 0.5, which is chance.", "Sufficiency model accuracy")}
      </div>
    </div>

    <div class="block">
      <h3>Other bumps that changed the design</h3>
      <ul class="bumps">
        <li><strong>The check was measuring the wrong thing.</strong> An early dev check made the broken model look better than the original. We rebuilt it to follow exactly the same steps as the real test, and then dev and test agreed.</li>
        <li><strong>One threshold was doing two jobs.</strong> The same lower line decided “Incorrect” and also filtered pages, and it threw away too many second-step pages. With a separate page cut-off, the share of dev questions keeping all supporting facts went from 56% to 89%.</li>
        <li><strong>The teacher filter threw away most of the data.</strong> A first version dropped 57% of the training candidates. The fixed version drops 1 to 4%.</li>
        <li><strong>The free quota ran out.</strong> The free tier of the hosted model service allows 200,000 tokens a day per model, which would have taken close to four weeks. Bulk generation moved to an open model on Kaggle, and the hosted service stayed for the live demo and the judge.</li>
      </ul>
    </div>
  </div>
</section>

<section class="sec" id="${p}-test" aria-labelledby="${p}-test-h">
  <div class="wrap">
    <h2 id="${p}-test-h">How we tested it fairly</h2>
    <div class="prose">
      <p>A claim like “it hallucinates less” is easy to fake by accident. These are the rules that keep our test honest.</p>
    </div>

    <div class="block">
      <h3>Three kinds of evidence, for the same questions</h3>
      <div class="two">
        <div class="prose">
          <p>We used HotpotQA, questions that need two pages to answer, with a pool of ${h.n("counts.pool_paragraphs", "int", "4,969")} paragraphs. We then built three versions of every question, so we could see how the system behaves when the evidence is good, absent or tampered with.</p>
          <p><strong>Supportive:</strong> the right paragraphs are in the pool. <strong>Missing:</strong> the right paragraphs are removed, so the only honest answer is “I don't know”. <strong>Misleading:</strong> in the right paragraph, the answer is swapped for another answer of the same type. Repeating the swapped one counts as a <strong>planted</strong> answer.</p>
          <p>That gives 300, 300 and 239 questions. Only 239 of the 300 got a valid swap.</p>
        </div>
        ${h.fig("conditions", "One real question shown under all three conditions.", "The three evidence conditions")}
      </div>
    </div>

    <div class="block">
      <h3>The same writer for every setup</h3>
      <div class="two">
        <div class="prose">
          <p>We compared seven setups, A to G, each one adding a station to the one before. Every setup used the same writer model, so any difference comes from the line and not from a smarter writer. Identical prompts were generated once and reused.</p>
        </div>
        <ol class="ladder" aria-label="The seven setups">
          <li><b>A</b><span>Plain RAG, top 8 pages</span></li>
          <li><b>B</b><span>A, with an off-the-shelf reranker</span></li>
          <li><b>C</b><span>A, with our inspector as a filter</span></li>
          <li><b>D</b><span>C, plus trimming to sentences</span></li>
          <li><b>E</b><span>D, plus the Correct / Ambiguous / Incorrect decision and search again</span></li>
          <li><b>F</b><span>E, plus the sufficiency check: the full system</span></li>
          <li><b>G</b><span>F with one threshold instead of two</span></li>
        </ol>
      </div>
    </div>

    <div class="block">
      <h3>A practice exam and a final exam</h3>
      <div class="two">
        <div class="prose">
          <p>We split the questions into <strong>dev</strong> (200) and <strong>test</strong> (300). Every knob was set on dev: the thresholds, the cut-offs, the choice of 0.90. The rule for choosing each knob was written in the plan before the dev answers existed. The 300 test questions were run once, at the end.</p>
          <p>It is the difference between a practice exam you can learn from and a final exam you only sit once.</p>
        </div>
        <div class="split" aria-hidden="true">
          <div class="split-a"><b>dev</b><span>200 questions</span><i>Tune every knob here</i></div>
          <div class="split-b"><b>test</b><span>300 questions</span><i>Sealed until the end. Run once.</i></div>
        </div>
      </div>
    </div>

    <div class="block">
      <h3>What a confidence interval says</h3>
      <div class="two">
        <div class="prose">
          <p>A result from 300 questions is not exact. If we had picked another 300, we would get slightly different numbers. A <strong>95% confidence interval</strong> gives the range of values that the true difference plausibly sits in.</p>
          <p>We computed ours by redrawing the questions with replacement 10,000 times and measuring the difference each time. This is a paired bootstrap, and “paired” means both systems are compared on the same questions.</p>
          <p>How to read it: if the whole range is on one side of zero, the difference is very unlikely to be luck. If the range touches zero, we cannot say. The unit is <strong>pp</strong>, percentage points: going from 24.7% to 18.3% is a drop of 6.3 pp.</p>
        </div>
        ${h.fig("forest", "Full system (F) minus plain RAG (A), from the test run. Each row shows the change in percentage points and its 95% interval.", "Confidence intervals for the main comparisons")}
      </div>
    </div>

    <div class="block">
      <h3>Four possible outcomes</h3>
      <ul class="outcomes">
        <li data-k="pass"><b>Correct</b> The answer matches the gold answer.</li>
        <li data-k="abstain"><b>I don't know</b> The system declined to answer.</li>
        <li data-k="plant"><b>Planted</b> It repeated the swapped answer.</li>
        <li data-k="reject"><b>Wrong</b> Any other answer. The reports call this hallucination.</li>
      </ul>
    </div>
  </div>
</section>

<section class="sec alt" id="${p}-results" aria-labelledby="${p}-results-h">
  <div class="wrap">
    <h2 id="${p}-results-h">What we found</h2>
    <div class="prose">
      <p>The comparison that matters is the full system (F) against plain RAG (A), on 839 question and condition pairs from the test set. Use the chips to add one station at a time and see what each one changes.</p>
    </div>
    ${h.fig("outcomes", "Each bar is 100% of the questions in that condition. Data from the test run.", "Outcomes by setup and condition")}

    <div class="block">
      <h3>What improved</h3>
      <div class="two">
        <div class="prose">
          <p>The full system gave fewer wrong answers in all three conditions. On supportive questions the rate fell from ${h.n("test.aggregate.A.supportive.hallucinate", "pct1", "24.7%")} to ${h.n("test.aggregate.F.supportive.hallucinate", "pct1", "18.3%")}. On missing-evidence questions it fell from ${h.n("test.aggregate.A.missing.hallucinate", "pct1", "8.0%")} to ${h.n("test.aggregate.F.missing.hallucinate", "pct1", "0.7%")}. On misleading questions it fell from ${h.n("test.aggregate.A.misleading.hallucinate", "pct1", "24.7%")} to ${h.n("test.aggregate.F.misleading.hallucinate", "pct1", "17.2%")}. The paired drops are 6.3, 7.3 and 7.5 pp, and every confidence interval excludes zero.</p>
          <p>It also sends the writer far less to read. The text shrinks to about a fifth.</p>
        </div>
        ${h.fig("tokens", "Average tokens sent to the writer. A token is a piece of a word, roughly three quarters of a word.", "Context size, plain RAG against the full system")}
      </div>
    </div>

    <div class="block">
      <h3>What it cost</h3>
      <div class="two">
        <div class="prose">
          <p>The line says “I don't know” more often, and some of those cases would have been right. On supportive questions the share answered fell from ${h.n("test.aggregate.A.supportive.coverage", "pct0", "73%")} to ${h.n("test.aggregate.F.supportive.coverage", "pct0", "62%")}, and the correct rate fell by 5.0 pp (the interval just touches zero, p = 0.06).</p>
          <p>It also did not solve tampered evidence. The planted-answer rate went from ${h.n("test.aggregate.A.misleading.planted", "pct1", "30.5%")} to ${h.n("test.aggregate.F.misleading.planted", "pct1", "27.6%")}, which is not a significant change. A fluent paragraph with one fact swapped looks fine to the inspector. The Sun Valley example earlier shows exactly that.</p>
          <p>One more caution. The writer model already says “I don't know” by itself on 85% of the missing-evidence questions, which leaves less room for the line to help than a more confident writer would.</p>
        </div>
        ${h.fig("costcard", "One real question where plain RAG was right and the full line held back.", "A question where the line cost a correct answer")}
      </div>
    </div>

    <div class="block">
      <h3>Does the strict marking hide something?</h3>
      <div class="two">
        <div class="prose">
          <p>Our scoring is strict. “Chris Pine” does not match “Christopher Whitelaw Pine”. To see how much that matters, a judge model from a different family read 100 answers and graded them.</p>
          <p>It agreed with the strict scoring on 85 of the 100 (Cohen's kappa 0.71, which is a good level of agreement). All 15 disagreements went the same way: the judge accepted a name variant that our scoring rejected. So our numbers overstate hallucination for every setup. They also mean that part of the full system's gain may come from answering less, not only from answering better.</p>
        </div>
        ${h.fig("judge", "One square per answer in the 100-answer sample. The sample was stratified, so these shares are not population rates.", "Agreement between the judge and the strict scoring")}
      </div>
    </div>
  </div>
</section>

<section class="sec" id="${p}-limits" aria-labelledby="${p}-limits-h">
  <div class="wrap">
    <h2 id="${p}-limits-h">What it can't do yet, and what's next</h2>
    <div class="two limits">
      <div>
        <h3>Limits</h3>
        <ul class="lim">
          <li><strong>Tampered evidence slips through.</strong> A fluent paragraph with a swapped fact still scores well. Most planted answers survive every setup.</li>
          <li><strong>Everything was built from HotpotQA.</strong> The sufficiency labels, the misleading condition and most of the inspector's training data all come from it. The results say little about other kinds of text, and the inspector is slightly worse than its base model out of domain.</li>
          <li><strong>Trimming can cut what you need.</strong> After trimming, all supporting facts survive for only about 57% of supportive questions.</li>
          <li><strong>The marking is strict.</strong> Absolute hallucination numbers are too high for every setup.</li>
          <li><strong>The search-again station did not help</strong> in this setting.</li>
          <li><strong>Smaller shortcuts.</strong> One training seed instead of three, and no human check of the sufficiency labels.</li>
        </ul>
      </div>
      <div>
        <h3>What comes next</h3>
        <ul class="lim next">
          <li>A way to catch a fluent paragraph that was altered, for example by checking whether independent sources agree, or by training on such edits.</li>
          <li>Testing on other kinds of text than HotpotQA.</li>
          <li>Marking that accepts name variants, so absolute numbers are fairer.</li>
          <li>Keeping more of the needed sentences when trimming.</li>
          <li>Dropping the search-again station, or testing it with a stronger rewriter.</li>
          <li>Repeating the training with several seeds.</li>
        </ul>
      </div>
    </div>
  </div>
</section>
`,

  glossTitle: "Glossary",
  gloss: [
    ["RAG", "Retrieval-augmented generation. A search step fetches pages first, and the model writes its answer from them."],
    ["Passage", "One page or paragraph that the search brings back."],
    ["Verifier / cross-encoder", "A small model that reads a question and a page together and gives a score from 0 to 1 for how much the page helps."],
    ["Threshold", "A line on a scale. Above it one thing happens, below it another."],
    ["Calibration", "Adjusting scores so that they mean what they say: a score of 0.6 should be right about 60% of the time."],
    ["Hallucination", "A confident answer that is wrong or made up."],
    ["Abstain", "Decline to answer and say “I don't know”. It is a deliberate decision."],
    ["Confidence interval", "The range in which the true difference plausibly sits. If it touches zero, the difference may be luck."],
    ["Dev / test split", "Dev questions are for tuning every knob. Test questions are the final exam, run once."],
    ["Planted answer", "A swapped answer that we put into the evidence on purpose, to see whether the system repeats it."],
    ["Fine-tuning", "Extra practice that adjusts an existing model for a specific kind of task."],
    ["Token", "A piece of a word. A model reads and writes in tokens."],
  ],
  sourceNote:
    "Every number on this page is loaded from the project's data file, which is generated from <code>results/</code>, or is quoted from <code>results/report.md</code>.",
};
