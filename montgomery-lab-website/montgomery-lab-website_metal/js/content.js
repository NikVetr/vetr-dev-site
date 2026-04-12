const currentRoster = [
  { name: "Stephen B. Montgomery", role: "Principal Investigator", focus: "Genetic variation, gene regulation, molecular phenotypes, and disease.", email: "smontgom@stanford.edu", headshot: "assets/generated/headshots/stephen-montgomery.webp" },
  { name: "Laurens van de Wiel", role: "Postdoctoral researcher", focus: "Statistical genetics, molecular phenotypes, and population-scale interpretation.", headshot: "assets/generated/headshots/laurens-van-de-wiel.webp" },
  { name: "Ronit Jain", role: "Research member", focus: "Functional genomics and collaborative project execution across the active portfolio.", email: "ronitj@stanford.edu" },
  { name: "Maggie Maurer", role: "Research member", focus: "Experimental and computational support across shared genomics programs." },
  { name: "Kate Lawrence", role: "Graduate student", focus: "Genetics training at the interface of molecular mechanism and disease biology.", headshot: "assets/generated/headshots/kate-lawrence.webp" },
  { name: "Julie Lake", role: "Research member", focus: "Project execution in a fast-moving mixed wet-lab and computational environment." },
  { name: "Daniel Nachun", role: "Instructor", focus: "Human genetics, transcriptomic interpretation, and rare-disease-oriented analysis.", headshot: "assets/generated/headshots/daniel-nachun.webp" },
  { name: "Evin Padhi", role: "Research member", focus: "Molecular phenotyping and day-to-day collaborative scientific delivery." },
  { name: "Paul Petrowski", role: "Research member", focus: "Applied analysis, infrastructure, and scientific coordination across lab programs." },
  { name: "Yilin Xie", role: "Research member", focus: "Data-driven interpretation across the lab's regulatory and translational work." },
  { name: "Nikolai Gates Vetr", role: "Postdoctoral researcher", focus: "Cross-population transcriptomics, computational genomics, and scientific software.", headshot: "assets/generated/headshots/nik-vetr.webp" },
  { name: "Esther Robb", role: "Research member", focus: "Collaborative execution at the boundary of experimentation and genomic analysis." },
  { name: "Victoria", role: "Research member", focus: "Current lab member contributing to ongoing genomics and translational projects." },
  { name: "Jordan", role: "Research member", focus: "Current lab member working across shared research operations and scientific delivery." },
  { name: "Sherry Yang", role: "Graduate student", focus: "Training in computational and molecular genomics with emphasis on mechanism.", headshot: "assets/generated/headshots/sherry-yang.webp" },
  { name: "Sohaib Hassan", role: "Research member", focus: "Current lab member contributing to active collaborative genomics programs." },
  { name: "Josh", role: "Research member", focus: "Current lab member supporting ongoing research across the lab's scientific stack." },
  { name: "Yassine", role: "Research member", focus: "Current lab member working inside shared computational and biological projects." },
  { name: "Iman Jaljuli", role: "Research member", focus: "Project-focused contribution across the lab's active research network." },
  { name: "Haim Krupkin", role: "Research member", focus: "Ongoing work at the intersection of genetics, interpretation, and experimental execution." },
  { name: "Ziming Weng", role: "Research member", focus: "Current lab member contributing to data-rich studies of human genomic function." },
  { name: "Kevin Smith", role: "Senior scientist", focus: "Senior scientific leadership across collaborative programs and operational scale-up.", headshot: "assets/generated/headshots/kevin-smith.webp" },
  { name: "Char Armitage", role: "Administrative assistant", focus: "Administrative operations, scheduling, logistics, and coordination for the lab.", email: "carmitag@stanford.edu" },
];

const alumniRoster = [
  "Mike Gloudemans",
  "Nicole Gay",
  "Nicole Ersaro",
  "Joe Davis",
  "Laure Fresard",
  "Emily Tsang",
  "Olivia de Goede",
  "Bruna Balliu",
  "Olga Sazonova",
  "Tracy Nance",
  "Nathan Abell",
  "Abhiram Rao",
  "Craig Smail",
  "Bosh Liu",
  "Kim Kukurba",
  "Xin Li",
  "Konrad Karczewski",
  "Matthew Durrant",
  "Zach Zappala",
  "Nikki Teran",
  "Salil Deshpande",
  "Marie Huynh",
  "Tiffany Eulalio",
  "Alexander Ioannadis",
  "Jarod Rutledge",
  "Rachel Ungar",
  "Ying Sun",
  "Qianhui Zheng",
  "Marianne DeGorter",
  "Pagé Goddard",
  "Emily Greenwald",
  "Tanner Jensen",
  "Andrew Marderstein",
  "Kameron Rodrigues",
  "Alex Miller",
  "Jeren Olsen",
  "Jonathan Nguyen",
  "Aditi Goyal",
];

export const metalContent = {
  meta: {
    title: "Montgomery Lab Metal",
    description: "A heavy metal public interface for the Montgomery Lab at Stanford University.",
  },
  nav: [
    { id: "home", track: "01", label: "Overture", href: "index.html", subtitle: "front gate" },
    { id: "research", track: "02", label: "Riffs", href: "research.html", subtitle: "research engines" },
    { id: "publications", track: "03", label: "Vinyl", href: "publications.html", subtitle: "papers" },
    { id: "team", track: "04", label: "Crew", href: "team.html", subtitle: "people" },
    { id: "consortia", track: "05", label: "Tour", href: "consortia.html", subtitle: "partners" },
    { id: "resources", track: "06", label: "Gear", href: "resources.html", subtitle: "tools" },
    { id: "join", track: "07", label: "Audition", href: "join.html", subtitle: "how to join" },
    { id: "news", track: "08", label: "Archive", href: "news.html", subtitle: "milestones" },
    { id: "contact", track: "09", label: "Signal", href: "contact.html", subtitle: "contact" },
  ],
  songs: [
    { title: "Genomic Disco", src: "assets/songs/genomic_disco.mp3", pages: ["home"] },
    { title: "Bioinformatics Battleground", src: "assets/songs/bioinformatics_battleground.mp3", pages: ["research"] },
    { title: "Data Deluge", src: "assets/songs/data_deluge.mp3", pages: ["publications"] },
    { title: "Lab Core", src: "assets/songs/lab_core.mp3", pages: ["team"] },
    { title: "Horsemen of GREGoR", src: "assets/songs/horsemen_of_GREGoR.mp3", pages: ["consortia"] },
    { title: "Splice, Dice and Slide", src: "assets/songs/splice_dice_and_slide.mp3", pages: ["resources"] },
    { title: "Montgomery Quest", src: "assets/songs/montgomery_quest.mp3", pages: ["join"] },
    { title: "Scientific Glory", src: "assets/songs/scientific_glory.mp3", pages: ["news"] },
    { title: "Rare Variant Blues", src: "assets/songs/rare_variant_blues.mp3", pages: ["contact"] },
    { title: "Cosmic Connections", src: "assets/songs/cosmic_connections.mp3", pages: [] },
    { title: "Dance of Genes", src: "assets/songs/dance_of_genes.mp3", pages: [] },
    { title: "Paul's Playlist Blues", src: "assets/songs/pauls_playlist_blues.mp3", pages: [] },
  ],
  pages: {
    home: {
      kicker: "Stanford Medicine / Montgomery Lab",
      title: "Bioinformatics turned up to 11.",
      lede:
        "The Montgomery Lab studies how human genetic variation shapes gene regulation, molecular phenotypes, and disease through functional genomics, rare-disease interpretation, computational biology, and consortium-scale science.",
      ampNote:
        "The overture sets the gain: variant signal, molecular readout, interpretation, and public resources all feed the same lab amplifier.",
      image: "assets/generated/home/lab-room.webp",
    },
    research: {
      kicker: "Riff Lab",
      title: "Four engines, one signal chain.",
      lede:
        "The lab links regulatory variation, molecular phenotypes, and disease-facing interpretation through experiments, computation, and collaborative scale.",
      ampNote:
        "Research riffs are modular: regulation, rare disease, atlas-scale measurement, and tooling can stand alone, but they hit harder in sequence.",
      image: "assets/generated/home/hero-pictionary.webp",
    },
    publications: {
      kicker: "Discography",
      title: "Papers, releases, and milestone tracks.",
      lede:
        "Selected papers show how the lab moves from foundational transcriptome genetics to clinically oriented interpretation and consortium-scale atlases.",
      ampNote:
        "The publication discography follows recurring themes: RNA, rare variants, tissue context, and large public reference resources.",
      image: "assets/generated/page-hero/publications-ashg.webp",
    },
    team: {
      kicker: "Crew Wall",
      title: "The people behind the wall of sound.",
      lede:
        "The lab operates through faculty, instructors, staff scientists, trainees, research members, and administrative support connected through shared scientific execution.",
      ampNote:
        "The crew is the instrument: wet lab, computation, statistics, project execution, and operations tuned together.",
      image: "assets/generated/home/team-group.webp",
    },
    consortia: {
      kicker: "Tour Map",
      title: "Programs large enough to shake the floor.",
      lede:
        "The Montgomery Lab contributes to national and cross-institutional efforts where data generation, interpretation standards, and public resources all matter.",
      ampNote:
        "Consortia are the tour stops: different stages, shared standards, and a much larger audience for data products.",
      image: "assets/generated/home/lab-social.webp",
    },
    resources: {
      kicker: "Gear Table",
      title: "Tools, portals, workflows, and field-tested methods.",
      lede:
        "The lab builds software, workflows, portal connections, and computational habits that make high-dimensional genomics work practical.",
      ampNote:
        "The gear table is public infrastructure: methods, code, portals, and guides that help other groups play the same riffs.",
      image: "assets/generated/page-hero/resources-pictionary.webp",
    },
    join: {
      kicker: "Auditions",
      title: "How to step into the lab.",
      lede:
        "The lab is built for people who want to operate across computation, biology, infrastructure, and mechanism rather than staying inside a single silo.",
      ampNote:
        "Audition with specificity: say what you have done, what you want to build, and why this lab's mixed experimental and computational stack fits.",
      image: "assets/generated/page-hero/join-retreat-dinner.webp",
    },
    news: {
      kicker: "Archive",
      title: "Milestones from the back catalog.",
      lede:
        "The lab's public arc includes foundational transcriptome genetics, GTEx-era regulatory biology, and newer high-profile consortium work in exercise and disease.",
      ampNote:
        "The archive tracks the loud moments: foundational papers, GTEx, MoTrPAC, and the long arc of public scientific infrastructure.",
      image: "assets/generated/home/escape-room.webp",
    },
    contact: {
      kicker: "Signal Routing",
      title: "Where to send the signal.",
      lede:
        "Use this page for direct contact, official Montgomery Lab links, and practical routes into the lab's public presence.",
      ampNote:
        "Signal routing is simple: scientific messages to Stephen Montgomery; administrative and scheduling questions can also route through Char Armitage.",
      image: "assets/generated/page-hero/contact-beach-group.webp",
    },
  },
  hero: {
    chips: ["functional genomics", "rare disease", "molecular phenotypes", "platform-scale biology"],
    metrics: [
      { value: "23", label: "current members including administrative support" },
      { value: "10", label: "major consortium programs" },
      { value: "11+", label: "public tools and resources" },
      { value: "4", label: "core scientific engines" },
    ],
  },
  research: {
    intro:
      "The lab's scientific stack is organized around signal extraction, mechanistic interpretation, diagnostic consequence, and data systems that scale well beyond a single project.",
    cards: [
      {
        eyebrow: "Regulatory riff",
        title: "Trace how variation rewires expression, splicing, and regulatory circuitry.",
        text:
          "Expression, splicing, structural variation, and other molecular phenotypes are used to explain why genomes behave differently across people, tissues, and disease contexts.",
        bullets: ["expression and splicing QTLs", "structural variation", "understudied RNA biology"],
      },
      {
        eyebrow: "Rare-disease riff",
        title: "Move from unsolved cases to molecular mechanism.",
        text:
          "Rare-disease work combines outlier detection, transcriptomic interpretation, and multi-omic evidence so variants can be explained at the level of biological mechanism.",
        bullets: ["GREGoR and UDN-facing analyses", "diagnostic consequence", "multi-omic interpretation"],
      },
      {
        eyebrow: "Atlas riff",
        title: "Operate inside programs that only make sense at national scale.",
        text:
          "The lab contributes to efforts where transcriptomic, proteomic, epigenomic, and phenotypic measurements can be interpreted across tissues, cohorts, and study designs.",
        bullets: ["GTEx and dGTEx", "MoTrPAC", "TOPMed, IGVF, SMaHT, All of Us, ENCODE4"],
      },
      {
        eyebrow: "Tooling riff",
        title: "Leave behind methods, browsers, and computational infrastructure.",
        text:
          "The output is not only papers. The lab builds reusable tools, data resources, and statistical methods that other groups can deploy in practical analysis workflows.",
        bullets: ["EAGLE", "EigenMT", "ANT-seq", "SplicePlot", "Path-scan"],
      },
    ],
    pipeline: [
      { label: "Input", title: "Variant and cohort data", text: "Human genetic variation, tissue context, and cohort-scale molecular data enter the signal chain together." },
      { label: "Readout", title: "Expression and splicing consequence", text: "The lab measures how variants shape transcript abundance, splicing, and other molecular outputs." },
      { label: "Mechanism", title: "Biological interpretation", text: "Signal is refined into regulatory mechanism, pathway-level consequence, and functional hypothesis." },
      { label: "Translation", title: "Diagnosis, tools, and public resources", text: "The result becomes disease interpretation, reusable software, or a broader reference resource." },
    ],
    projects: [
      { title: "MoTrPAC", status: "live", text: "Exercise-responsive multi-omics and public portal development." },
      { title: "Rare variant multi-omics impact", status: "published", text: "Connecting rare variation to molecular consequence." },
      { title: "GTEx ancestry-aware interpretation", status: "live", text: "Regulatory interpretation with ancestry and tissue context." },
      { title: "African transcriptomic colocalization", status: "live", text: "Cross-population colocalization and ancestry-matched regulatory biology." },
    ],
  },
  publications: {
    feedPath: "assets/data/scholar-feed.json",
    image: "assets/generated/page-hero/publications-ashg.webp",
    featured: [
      { year: "2010", title: "Whole-genome and transcriptome integration in human populations", detail: "Foundational work that helped establish the lab's long-running focus on transcriptome genetics and regulatory consequence.", href: "https://med.stanford.edu/profiles/stephen-montgomery" },
      { year: "2017", title: "GTEx analyses of genetic effects on expression across tissues", detail: "A defining reference point for tissue-aware interpretation of regulatory variation across the human body.", href: "https://www.nature.com/articles/nature24277" },
      { year: "2024", title: "MoTrPAC molecular effects of exercise training", detail: "A high-visibility milestone linking physiology to multi-omic change at scale.", href: "https://med.stanford.edu/news/all-news/2024/05/exercise-molecular-changes.html" },
    ],
    streams: [
      { title: "Regulatory genetics", text: "Expression QTLs, splicing, and transcriptome interpretation across tissues and populations." },
      { title: "Rare-disease mechanism", text: "Outlier-based molecular diagnosis and variant interpretation tied to mechanism." },
      { title: "Consortium-scale atlases", text: "Large collaborative maps that connect physiology, development, and genomic function." },
    ],
  },
  team: {
    leadership: {
      name: "Stephen B. Montgomery",
      role: "Founder / Principal Investigator",
      headshot: "assets/generated/headshots/stephen-montgomery.webp",
      summary:
        "Stephen B. Montgomery is an Endowed Professor of Pathology, Professor of Genetics, Professor of Biomedical Data Science, and Professor by courtesy of Computer Science at Stanford. His research connects genetic variation to gene regulation, molecular phenotypes, and disease.",
      links: [
        { label: "Stanford profile", href: "https://med.stanford.edu/profiles/stephen-montgomery" },
        { label: "Scholar", href: "https://scholar.google.com/citations?hl=en&user=117h3CAAAAAJ" },
        { label: "Email", href: "mailto:smontgom@stanford.edu" },
      ],
    },
    roster: currentRoster,
    alumni: alumniRoster,
    note:
      "The current roster combines leadership, instruction, staff science, graduate training, postdoctoral work, and administrative coordination in one shared research environment.",
  },
  consortia: [
    { shortName: "GREGoR", role: "Principal Investigator", logo: "assets/consortium_logos/gregor1.png", summary: "Rare disease diagnosis supported by multi-omic interpretation and functional consequence mapping.", output: "Clinical mechanism and molecular interpretation" },
    { shortName: "MoTrPAC", role: "Principal Investigator", logo: "assets/consortium_logos/motrpac.png", summary: "Body-wide molecular responses to exercise training across tissues, assays, and training states.", output: "Exercise multi-omics and public portal outputs" },
    { shortName: "TOPMed", role: "Principal Investigator", logo: "assets/consortium_logos/TOPMed.png", summary: "Population-scale genomics and precision medicine infrastructure.", output: "Large cohort interpretation and translational context" },
    { shortName: "Functional ADSP", role: "Principal Investigator", logo: "assets/consortium_logos/fungen.png", summary: "Alzheimer's disease genetics interpreted through functional genomic systems.", output: "Disease-focused functional genomics" },
    { shortName: "dGTEx", role: "Investigator", logo: "assets/consortium_logos/dGTEx.png", summary: "Developmental tissue regulation and expression programs across human biology.", output: "Developmental regulation and tissue context" },
    { shortName: "IGVF", role: "Investigator", logo: "assets/consortium_logos/iGVF.png", summary: "Interpretable maps linking genomic variants to function.", output: "Variant-to-function reference maps" },
    { shortName: "SMaHT", role: "Investigator", logo: "assets/consortium_logos/SMaHT.png", summary: "Cell atlas and molecular reference generation at systems scale.", output: "Reference atlases and molecular standards" },
    { shortName: "All of Us", role: "Investigator", logo: "assets/consortium_logos/AoU.png", summary: "Population-scale precision medicine and representation-aware genomics.", output: "Representation-aware precision medicine resources" },
    { shortName: "UDN", role: "Investigator", logo: "assets/consortium_logos/UDN.png", summary: "Mechanism-first support for unresolved clinical cases.", output: "Case resolution and translational genomics" },
    { shortName: "ENCODE4", role: "Investigator", logo: "assets/consortium_logos/encode2.png", summary: "Reference functional genomics resources that shape interpretation workflows.", output: "Shared reference biology for downstream analysis" },
  ],
  resources: {
    intro:
      "The lab builds and uses a practical public stack: software, project resources, workflow guides, and consortium portals that help genomics work move faster and more reproducibly.",
    categories: [
      {
        title: "Public lab tools",
        text: "Software and methods pages associated with ancestry inference, regulatory annotation, QTL analysis, and variant interpretation.",
        items: [
          { label: "ANT-seq", href: "https://github.com/boxiangliu/ANTseq" },
          { label: "EAGLE", href: "https://davidaknowles.github.io/eagle/" },
          { label: "EigenMT", href: "https://github.com/joed3/eigenMT" },
          { label: "ORegAnno", href: "https://plone.bcgsc.ca/platform/bioinfo/software/ORegAnno" },
          { label: "Path-scan", href: "https://psb.stanford.edu/psb-online/proceedings/psb14/daneshjou.pdf" },
          { label: "SplicePlot", href: "https://github.com/wueric/SplicePlot" },
        ],
      },
      {
        title: "Project resources",
        text: "Supplemental material, summary statistics, and project pages tied to published work and shared analyses.",
        items: [
          { label: "Smooth muscle cell eQTL and sQTL summary statistics", href: "https://stanford.box.com/s/e6e8hyft5u7wix1nzg5mjfqa084c4tin" },
          { label: "Sardinia regulatory variation supplemental code", href: "https://github.com/zaczap/sardinia" },
          { label: "Kukurba et al. supplemental page", href: "https://smontgomlab.github.io/resources/kukurba2013/" },
          { label: "Montgomery et al. 2010 supplemental page", href: "http://jungle.unige.ch/rnaseq_CEU60/" },
        ],
      },
      {
        title: "Portal layer",
        text: "Collaborative programs and data portals that intersect directly with the lab's ongoing work.",
        items: [
          { label: "GREGoR", href: "https://gregor.stanford.edu/" },
          { label: "UDN Stanford", href: "https://undiagnosed.stanford.edu/" },
          { label: "MoTrPAC data hub", href: "https://motrpac-data.org/" },
          { label: "GTEx portal", href: "https://gtexportal.org/home/" },
          { label: "dGTEx", href: "https://dgtex.org/" },
        ],
      },
    ],
    guides: [
      { title: "Run notebooks on SCG through VS Code", text: "A practical route into cluster-based analysis using Remote SSH, interactive Slurm sessions, and notebook kernels on compute nodes.", href: "https://code.visualstudio.com/docs/remote/ssh" },
      { title: "Build reproducible pipelines with Snakemake", text: "A solid starting point for dry runs, DAG inspection, cluster execution, and longer-lived genomic workflows.", href: "https://snakemake.readthedocs.io/en/stable/tutorial/tutorial.html" },
      { title: "Start on Stanford computing with the lab primer", text: "The lab's SCG primer covers access, storage, interactive compute, and responsible shared usage.", href: "https://github.com/smontgomlab/resources/blob/master/scg_primer.md" },
    ],
  },
  join: {
    intro:
      "The lab is a fit for researchers who want to work across computation and biology, move comfortably between high-dimensional data and mechanism, and contribute to a collaborative environment where methods and interpretation both matter.",
    audiences: [
      { title: "Postdoctoral applicants", text: "Email Stephen Montgomery with a cover letter describing your research experience and the project directions that interest you, your CV, and contact information for two references." },
      { title: "Stanford PhD students", text: "Students interested in a rotation or longer-term fit should send a short introductory note and a brief CV, then follow up about project fit and timing." },
      { title: "Stanford undergraduates", text: "Undergraduates should send a short introduction, a description of interests, and an unofficial transcript. The lab typically facilitates internships for students already enrolled at Stanford." },
      { title: "Logistics and scheduling", text: "Scientific applications should go to Stephen Montgomery. Administrative and scheduling questions can also be routed to Char Armitage." },
    ],
    values: ["collaboration as a scientific method", "in-person discussion and fast iteration", "shared compute literacy", "health and sustainability"],
  },
  news: [
    { year: "2024", title: "MoTrPAC papers map the molecular effects of exercise training", text: "Stanford coverage in May 2024 highlighted a major public milestone linking physiology to multi-omic response at scale.", image: "assets/generated/home/lab-dinner.webp" },
    { year: "2017", title: "GTEx paper set becomes a defining reference point", text: "The October 17, 2017 GTEx release remains a landmark in how the lab approaches tissue-aware regulatory biology.", image: "assets/generated/home/lab-hike.webp" },
    { year: "2016", title: "The lab joins MoTrPAC", text: "The December 15, 2016 launch of the lab's role in MoTrPAC established a long-running connection to exercise biology at consortium scale.", image: "assets/generated/home/pictionary-room.webp" },
  ],
  contact: {
    email: "smontgom@stanford.edu",
    admin: "carmitag@stanford.edu",
    phone: "(650) 725-9641",
    location: "Edwards Building, Stanford School of Medicine, Stanford, CA",
    mailing: "Montgomery Lab, Stanford University, 1291 Welch Road, BLDG 07-309, Room R-212, Palo Alto, CA 94304",
    links: [
      { label: "Stanford lab page", href: "https://med.stanford.edu/montgomerylab.html" },
      { label: "Stanford profile", href: "https://med.stanford.edu/profiles/stephen-montgomery" },
      { label: "Google Scholar", href: "https://scholar.google.com/citations?hl=en&user=117h3CAAAAAJ" },
      { label: "Legacy site", href: "https://smontgomlab.github.io/" },
      { label: "GitHub", href: "https://github.com/smontgomlab" },
    ],
  },
};
