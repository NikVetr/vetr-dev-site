const currentMemberNames = [
  "Laurens van de Wiel",
  "Ronit Jain",
  "Maggie Maurer",
  "Kate Lawrence",
  "Julie Lake",
  "Daniel Nachun",
  "Evin Padhi",
  "Paul Petrowski",
  "Yilin Xie",
  "Nikolai Gates Vetr",
  "Esther Robb",
  "Victoria",
  "Jordan",
  "Sherry Yang",
  "Sohaib Hassan",
  "Josh",
  "Yassine",
  "Iman Jaljuli",
  "Haim Krupkin",
  "Ziming Weng",
  "Kevin Smith",
  "Char Armitage",
];

const rotationStudentNames = [];

const formerMembers = [
  { name: "Mike Gloudemans", email: "michaelgloudemans@gmail.com", bayArea: "yes" },
  { name: "Nicole Gay", email: "nicole.r.gay@gmail.com", bayArea: "yes" },
  { name: "Nicole Ersaro", email: "nmferraro5@gmail.com", bayArea: "yes" },
  { name: "Joe Davis", email: "pookad37@gmail.com", bayArea: "yes" },
  { name: "Laure Fresard", email: "fresard.laure@gmail.com", bayArea: "yes" },
  { name: "Emily Tsang", email: "emilytsang2@gmail.com", bayArea: "yes" },
  { name: "Olivia de Goede", email: "olivia.degoede@gmail.com", bayArea: "no" },
  { name: "Bruna Balliu", email: "brunilda.balliu@gmail.com", bayArea: "no" },
  { name: "Olga Sazonova", email: "ovnova@gmail.com", bayArea: "no" },
  { name: "Tracy Nance", email: "tracy.nance@gmail.com", bayArea: "no" },
  { name: "Nathan Abell", email: "abell.nathan@gmail.com", bayArea: "yes" },
  { name: "Abhiram Rao", email: "rao.abhiram@gmail.com", bayArea: "no" },
  { name: "Craig Smail", email: "csmail@cmu.edu", bayArea: "no" },
  { name: "Bosh Liu", email: "boxiangliu@nus.edu.sg", bayArea: "no" },
  { name: "Kim Kukurba", email: "kkukurba@gmail.com", bayArea: "no" },
  { name: "Xin Li", email: "lixin@picb.ac.cn", bayArea: "no" },
  { name: "Konrad Karczewski", email: "konradjkarczewski@gmail.com", bayArea: "no" },
  { name: "Matthew Durrant", email: "matthewgeorgedurrant@gmail.com", bayArea: "no" },
  { name: "Zach Zappala", email: "zaczap@gmail.com", bayArea: "no" },
  { name: "Nikki Teran", email: "", bayArea: "no" },
  { name: "Salil Deshpande", email: "", bayArea: "" },
  { name: "Marie Huynh", email: "", bayArea: "yes" },
  { name: "Tiffany Eulalio", email: "", bayArea: "no" },
  { name: "Alexander Ioannadis", email: "", bayArea: "" },
  { name: "Jarod Rutledge", email: "", bayArea: "no" },
  { name: "Rachel Ungar", email: "", bayArea: "yes" },
  { name: "Ying Sun", email: "", bayArea: "" },
  { name: "Qianhui Zheng", email: "", bayArea: "yes" },
  { name: "Marianne DeGorter", email: "", bayArea: "" },
  { name: "Pagé Goddard", email: "", bayArea: "" },
  { name: "Emily Greenwald", email: "", bayArea: "" },
  { name: "Tanner Jensen", email: "", bayArea: "" },
  { name: "Andrew Marderstein", email: "", bayArea: "" },
  { name: "Kameron Rodrigues", email: "", bayArea: "" },
  { name: "Alex Miller", email: "", bayArea: "" },
  { name: "Jeren Olsen", email: "", bayArea: "" },
  { name: "Jonathan Nguyen", email: "", bayArea: "" },
  { name: "Aditi Goyal", email: "", bayArea: "" },
];

const headshotsByName = {
  "Stephen B. Montgomery": "assets/generated/headshots/stephen-montgomery.webp",
  "Nikolai Gates Vetr": "assets/generated/headshots/nik-vetr.webp",
  "Marianne DeGorter": "assets/generated/headshots/marianne-degorter.webp",
  "Pagé Goddard": "assets/generated/headshots/page-goddard.webp",
  "Emily Greenwald": "assets/generated/headshots/emily-greenwald.webp",
  "Andrew Marderstein": "assets/generated/headshots/andrew-marderstein.webp",
  "Daniel Nachun": "assets/generated/headshots/daniel-nachun.webp",
  "Kameron Rodrigues": "assets/generated/headshots/kameron-rodrigues.webp",
  "Kevin Smith": "assets/generated/headshots/kevin-smith.webp",
  "Sherry Yang": "assets/generated/headshots/sherry-yang.webp",
  "Laurens van de Wiel": "assets/generated/headshots/laurens-van-de-wiel.webp",
  "Kate Lawrence": "assets/generated/headshots/kate-lawrence.webp",
  "Nicole Gay": "assets/generated/headshots/nicole-gay.webp",
  "Nicole Ersaro": "assets/generated/headshots/nicole-ersaro.webp",
};

const headshotPositionByName = {
  "Stephen B. Montgomery": "50% 32%",
  "Nikolai Gates Vetr": "50% 70%",
  "Marianne DeGorter": "50% 38%",
  "Pagé Goddard": "50% 38%",
  "Emily Greenwald": "50% 34%",
  "Andrew Marderstein": "50% 34%",
  "Daniel Nachun": "50% 32%",
  "Kameron Rodrigues": "50% 34%",
  "Kevin Smith": "50% 34%",
  "Sherry Yang": "50% 34%",
  "Laurens van de Wiel": "50% 30%",
  "Kate Lawrence": "50% 30%",
  "Nicole Gay": "50% 34%",
  "Nicole Ersaro": "50% 34%",
};

const rolesByName = {
  "Laurens van de Wiel": "Postdoctoral researcher",
  "Daniel Nachun": "Instructor",
  "Nikolai Gates Vetr": "Postdoctoral researcher",
  "Sherry Yang": "Graduate student",
  "Kevin Smith": "Senior scientist",
  "Kate Lawrence": "Graduate student",
  "Char Armitage": "Administrative assistant",
};

const biosByName = {
  "Nikolai Gates Vetr":
    "Nik received his PhD in Anthropology from UC Davis, where he worked on Bayesian models of phenotypic evolution. In the Montgomery Lab he develops statistical approaches for linking genetic and environmental variation to molecular phenotypes and translational biology.",
  "Marianne DeGorter":
    "Marianne DeGorter is a postdoctoral researcher in the Montgomery Lab, contributing to the lab's work in human genetics, molecular phenotyping, and large-scale genomics.",
  "Pagé Goddard":
    "Pagé works on rare-disease diagnosis through gene expression and contributes to the development of African functional genomics resources. She is also active in efforts to improve representation and diversity in genetic research.",
  "Emily Greenwald":
    "Emily's research focuses on age-related changes in extracellular nucleic acids, with broader interests in aging, cell signaling, and immune mechanisms. She also leads science outreach through WizardGenes.",
  "Andrew Marderstein":
    "Andrew joined the lab in 2021 after PhD training at Cornell. His work focuses on translating genetic associations into causal mechanisms by leveraging multi-omic data sets.",
  "Daniel Nachun":
    "Daniel received his PhD in Neuroscience from UCLA and works at the intersection of computational genomics, aging, and immunology. His interests include interpretable machine learning, Bayesian modeling, and large-scale computing for genomics.",
  "Kameron Rodrigues":
    "Kameron studies how human genetic variation shapes immune biology and common complex disease. Before graduate school at Stanford, he spent three years at the NIH conducting both wet-lab and dry-lab research.",
  "Kevin Smith":
    "Kevin directs wet-lab experiments for the Montgomery Lab. His work spans CRISPR-based studies of rare phenotypes, extracellular RNA biology, and epigenetic regulation through assays such as ATAC-seq.",
  "Sherry Yang":
    "Sherry is a Bioengineering PhD student whose work draws on prior experience in genetic engineering and gene regulatory networks. In the lab she studies epigenetic regulation and functional genomic consequence.",
  "Laurens van de Wiel":
    "Laurens focuses on bioinformatics and multi-omics in rare, undiagnosed disease. He previously built large-scale scientific software tools, including the widely used MetaDome web server, and now studies disruptive splicing in rare disorders at Stanford.",
  "Kate Lawrence":
    "Kate trained in physics and biophysics at MIT and now works in computational genomics. She is interested in using natural variation in the human genome to better understand gene expression and regulation.",
  "Nicole Gay":
    "Nicole studied the molecular mechanisms that confer the health benefits of exercise, including work through MoTrPAC. Her research also examined how genetic variation and ancestry contribute to gene regulation through GTEx-related projects.",
  "Nicole Ersaro":
    "Nicole Ferraro's work in the lab focused on rare-disease diagnosis, the molecular impact of rare variants, and genetics education. She trained in biomedical engineering before joining Stanford's Biomedical Informatics PhD program.",
};

const detailByName = {
  "Nikolai Gates Vetr":
    "Nik received his PhD in Anthropology from the University of California, Davis, where he focused on Bayesian models of phenotypic evolution and broader questions in population biology and data science. In the Montgomery Lab he is especially interested in developing statistical methods that clarify how genetic and environmental variation shape molecular phenotypes, with an eye toward drug discovery and personalized medicine.",
  "Pagé Goddard":
    "Pagé earned her degree in Molecular, Cell, and Developmental Biology at UCLA. At Stanford she has worked with the Undiagnosed Disease Network to use gene expression for rare-disease diagnosis and has contributed to the development of African functional genomics resources, while also remaining active in outreach and representation efforts in genetics.",
  "Emily Greenwald":
    "Emily joined Stanford after work affiliated with Boston Children's Hospital and Harvard Medical School. In the lab she studies age-related changes in extracellular nucleic acids and has broader interests in aging, cell signaling, immune mechanisms, outreach, and equity in science.",
  "Andrew Marderstein":
    "Andrew joined the Montgomery Lab in August 2021 after PhD training with Andy Clark and Olivier Elemento at Cornell. His research asks how genetics, lifestyle, and medications intersect across human disease, and how multi-omic data can turn genetic associations into biological mechanism.",
  "Daniel Nachun":
    "Daniel received his PhD in Neuroscience from UCLA in 2018 and is co-advised by Siddhartha Jaiswal. His work combines computational genomics, aging biology, immunology, interpretable machine learning, Bayesian inference, and large-scale computing infrastructure.",
  "Kameron Rodrigues":
    "Kameron completed dual majors in Biochemistry and Molecular and Cellular Biology at the University of Arizona, then spent three years at the NIH in both wet-lab and dry-lab research. At Stanford he studies how human genetic variation shapes the immune system in common complex disease and is co-mentored by Stephen Montgomery and Siddhartha Jaiswal.",
  "Kevin Smith":
    "Kevin received his PhD in Molecular Biology and Immunology from George Washington University and directs wet-lab experiments for the Montgomery Lab. His projects span CRISPR gene editing, extracellular RNA biology, open chromatin assays, and close integration between experimental and computational work.",
  "Sherry Yang":
    "Sherry came to the lab from New York as a Bioengineering PhD student with strong prior experience in genetic engineering and gene regulatory networks. Her graduate work turns toward epigenetic regulation and its functional impact, while she remains deeply engaged with outdoor life beyond the lab.",
  "Laurens van de Wiel":
    "Laurens is a postdoctoral scholar focused on bioinformatics and multi-omics in rare, undiagnosed disease. Before Stanford he built large-scale scientific software solutions and authored the MetaDome web server; his current work examines disruptive alternative splicing in rare disorders with support from a Rubicon Fellowship.",
  "Kate Lawrence":
    "Kate trained in physics at MIT with a focus on biophysics, then moved into computational genomics. She is interested in using natural human variation to better understand gene expression and gene regulation, and is also committed to science communication.",
  "Nicole Gay":
    "Nicole trained in biomedical engineering at the University of Connecticut before joining Stanford Genetics. In the lab she worked on exercise biology through MoTrPAC and on how ancestry and genetic variation contribute to the regulation of gene expression.",
  "Nicole Ersaro":
    "Nicole Ferraro earned a dual BS/MS in Biomedical Engineering from Drexel University before entering Stanford Biomedical Informatics. Her research centered on rare-disease diagnosis, the molecular impact of rare variants, genetics education, and science communication.",
};

const makeInitials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

const fallbackBio = (name, type) => {
  if (type === "rotation") {
    return `${name} is currently exploring projects in genomics and molecular biology through a rotation in the Montgomery Lab.`;
  }

  if (type === "alumni") {
    return `${name} previously worked in the Montgomery Lab and contributed to studies in human genetics, functional genomics, or regulatory biology.`;
  }

  return `${name} is a current member of the Montgomery Lab and contributes to the group's work in human genetics, functional genomics, and molecular biology.`;
};

export const siteData = {
  nav: [
    { label: "Home", href: "index.html", page: "home" },
    { label: "Research", href: "research.html", page: "research" },
    { label: "Team", href: "team.html", page: "team" },
    { label: "Publications", href: "publications.html", page: "publications" },
    { label: "Consortia", href: "consortia.html", page: "consortia", dropdown: true },
    { label: "Resources", href: "resources.html", page: "resources" },
    { label: "News", href: "news.html", page: "news" },
    { label: "Contact", href: "contact.html", page: "contact" },
  ],
  footerLinks: [
    { label: "Stanford Medicine", href: "https://med.stanford.edu/" },
    { label: "Montgomery Lab", href: "https://med.stanford.edu/montgomerylab.html" },
    { label: "Pathology", href: "https://pathology.stanford.edu/" },
    { label: "Genetics", href: "https://med.stanford.edu/genetics.html" },
    { label: "Biomedical Data Science", href: "https://dbds.stanford.edu/" },
    { label: "Computer Science", href: "https://cs.stanford.edu/" },
  ],
  headerCta: {
    label: "How to Join",
    href: "join.html",
  },
  contact: {
    email: "smontgom@stanford.edu",
    phone: "(650) 725-9641",
    phoneLink: "6507259641",
    location: "Edwards Building, Stanford School of Medicine, Stanford, CA",
    mailingAddress: "Montgomery Lab, Stanford University, 1291 Welch Road, BLDG 07-309, Room R-212, Palo Alto, CA 94304",
    officialLinks: [
      { label: "Official Stanford lab page", href: "https://med.stanford.edu/montgomerylab.html" },
      { label: "Stanford profile", href: "https://med.stanford.edu/profiles/stephen-montgomery" },
      { label: "Google Scholar", href: "https://scholar.google.com/citations?hl=en&user=117h3CAAAAAJ" },
      { label: "Legacy lab site", href: "https://smontgomlab.github.io/" },
      { label: "Lab GitHub", href: "https://github.com/smontgomlab" },
    ],
  },
  consortia: [
    {
      id: "gregor",
      shortName: "GREGoR",
      name: "Genomics Research to Elucidate the Genetics of Rare Disease",
      href: "consortia/gregor.html",
      role: "Principal Investigator",
      focus: "Rare disease diagnosis and multi-omic interpretation for unsolved clinical cases.",
      logo: "assets/consortium_logos/gregor1.png",
      summary:
        "GREGoR advances genomic strategies for unsolved rare disease, combining sequencing, functional interpretation, and clinical discovery.",
      roleDetail:
        "The Montgomery Lab contributes functional interpretation, molecular phenotyping, and rare-disease genomics expertise to the GREGoR ecosystem.",
      overview:
        "This consortium is centered on moving beyond sequence alone by connecting rare variants to transcriptomic and molecular consequences that can sharpen diagnosis.",
      labContribution:
        "Within the broader program, the lab's work fits naturally into multi-omic interpretation, outlier detection, and the translation of genomic findings into mechanism.",
      highlights: [
        "Rare disease diagnosis informed by functional genomics",
        "Integration of genomic, transcriptomic, and molecular data",
        "Clinical interpretation for unresolved cases",
      ],
    },
    {
      id: "motrpac",
      shortName: "MoTrPAC",
      name: "Molecular Transducers of Physical Activity Consortium",
      href: "consortia/motrpac.html",
      role: "Principal Investigator",
      focus: "Body-wide molecular responses to exercise training across tissues and assays.",
      logo: "assets/consortium_logos/motrpac.png",
      summary:
        "MoTrPAC maps how exercise reshapes the body at molecular resolution across tissues, assays, and training conditions.",
      roleDetail:
        "The Montgomery Lab participates in one of the highest-profile recent efforts to connect exercise physiology with multi-omic measurement at scale.",
      overview:
        "MoTrPAC brings together transcriptomic, proteomic, metabolomic, and related measurements to understand how physical activity drives coordinated biological change.",
      labContribution:
        "For the lab, this consortium extends core strengths in high-dimensional molecular data analysis into exercise-responsive biology and cross-tissue interpretation.",
      highlights: [
        "Large-scale molecular atlas of exercise adaptation",
        "Cross-tissue, cross-assay biology",
        "Strong overlap between consortium science and the lab's recent research momentum",
      ],
    },
    {
      id: "topmed",
      shortName: "TOPMed",
      name: "Trans-Omics for Precision Medicine",
      href: "consortia/topmed.html",
      role: "Principal Investigator",
      focus: "Large-scale genomic and omic integration for human disease and population studies.",
      logo: "assets/consortium_logos/TOPMed.png",
      summary:
        "TOPMed links large-scale sequencing with omic and clinical measurements to improve precision medicine across populations.",
      roleDetail:
        "The lab's participation aligns with long-standing interests in how variation, ancestry, and molecular phenotypes interact across human populations.",
      overview:
        "TOPMed is built around population-scale genomic data and its integration with downstream phenotypes, making it a natural home for quantitative genomics work.",
      labContribution:
        "The consortium complements the lab's work on gene regulation, ancestry-aware interpretation, and high-throughput analysis of human genetic effects.",
      highlights: [
        "Population-scale precision medicine",
        "Integration of genomic and molecular data",
        "Human disease and trait interpretation at scale",
      ],
    },
    {
      id: "functional-adsp",
      shortName: "Functional ADSP",
      name: "Functional Alzheimer's Disease Sequencing Project",
      href: "consortia/functional-adsp.html",
      role: "Principal Investigator",
      focus: "Functional follow-up for neurodegenerative disease genetics.",
      logo: "assets/consortium_logos/fungen.png",
      summary:
        "Functional ADSP pursues the biological interpretation of Alzheimer's disease genetics through downstream functional analysis.",
      roleDetail:
        "The Montgomery Lab's consortium role supports molecular follow-up for neurodegenerative disease signals and variant interpretation.",
      overview:
        "This program connects Alzheimer's-associated variation to functional consequences that can be studied through expression, regulation, and related molecular readouts.",
      labContribution:
        "The lab's strengths in transcriptome genetics and rare-variant interpretation make it a strong fit for translating sequencing findings into biological mechanism.",
      highlights: [
        "Neurodegenerative disease genetics",
        "Functional follow-up after sequencing discovery",
        "Molecular interpretation of risk-associated variation",
      ],
    },
    {
      id: "dgtex",
      shortName: "dGTEx",
      name: "Developmental GTEx",
      href: "consortia/dgtex.html",
      role: "Investigator",
      focus: "Developmental tissue context for regulatory effects.",
      logo: "assets/consortium_logos/dGTEx.png",
      summary:
        "Developmental GTEx extends regulatory genomics into developmental tissue contexts where gene control can differ dramatically from adulthood.",
      roleDetail:
        "This work expands familiar GTEx questions into developmental windows that are essential for understanding regulatory effects and disease origins.",
      overview:
        "By studying developmental tissues, dGTEx helps explain when and where regulatory effects emerge, and how timing shapes biological consequence.",
      labContribution:
        "The consortium fits the lab's broader interest in tissue-specific regulation, expression, and how human variation acts in specific biological contexts.",
      highlights: [
        "Developmental context for regulatory effects",
        "Extension of GTEx-style thinking into earlier biology",
        "Tissue-aware interpretation of genomic variation",
      ],
    },
    {
      id: "igvf",
      shortName: "IGVF",
      name: "Impact of Genomic Variation on Function",
      href: "consortia/igvf.html",
      role: "Investigator",
      focus: "Functional interpretation of variation across assays and cell systems.",
      logo: "assets/consortium_logos/iGVF.png",
      summary:
        "IGVF focuses on how genomic variation changes function across assays, models, and cellular systems.",
      roleDetail:
        "The lab's role in IGVF aligns directly with its central scientific question: how genetic variation reshapes molecular function.",
      overview:
        "The consortium develops shared frameworks and datasets for moving from variant catalogues to experimentally and computationally grounded interpretation.",
      labContribution:
        "This work intersects with the lab's interest in regulation, splicing, molecular outliers, and systematic functional genomics.",
      highlights: [
        "Variant-to-function interpretation",
        "Cross-assay functional genomics",
        "Shared infrastructure for genomic effect mapping",
      ],
    },
    {
      id: "smaht",
      shortName: "SMaHT",
      name: "Somatic Mosaicism across Human Tissues",
      href: "consortia/smaht.html",
      role: "Investigator",
      focus: "Mosaic variation and tissue-specific genomics.",
      logo: "assets/consortium_logos/SMaHT.png",
      summary:
        "SMaHT investigates somatic mosaic variation across human tissues and the biological consequences of that diversity.",
      roleDetail:
        "The consortium complements the lab's broader interest in tissue-specific genomics and complex patterns of genetic variation across the body.",
      overview:
        "Somatic mosaicism raises questions that are both technical and biological, requiring careful measurement, tissue context, and integrative interpretation.",
      labContribution:
        "The lab's quantitative and molecular expertise supports the interpretation of mosaic variation in relation to expression, regulation, and tissue identity.",
      highlights: [
        "Somatic mosaicism across tissues",
        "Tissue-specific genomics",
        "Integration of complex variation with molecular phenotypes",
      ],
    },
    {
      id: "all-of-us",
      shortName: "All of Us",
      name: "All of Us Research Program",
      href: "consortia/all-of-us.html",
      role: "Investigator",
      focus: "Population-scale precision medicine resources.",
      logo: "assets/consortium_logos/AoU.png",
      summary:
        "All of Us is building a large and diverse resource for population-scale precision medicine research.",
      roleDetail:
        "Participation in All of Us reinforces the lab's interest in broad, diverse genomic resources and the interpretation of variation across populations.",
      overview:
        "The program aims to support a new generation of precision medicine studies by combining scale, diversity, and longitudinal health information.",
      labContribution:
        "For the lab, the program connects directly to questions around ancestry, regulation, molecular phenotypes, and the value of large reference resources.",
      highlights: [
        "Large-scale precision medicine resource",
        "Population diversity and representation",
        "Long-term value for genomic discovery and interpretation",
      ],
    },
    {
      id: "udn",
      shortName: "UDN",
      name: "Undiagnosed Diseases Network",
      href: "consortia/udn.html",
      role: "Investigator",
      focus: "Hard clinical cases that need deeper molecular interpretation.",
      logo: "assets/consortium_logos/UDN.png",
      summary:
        "UDN addresses especially challenging clinical cases where standard diagnostic approaches have not yet provided answers.",
      roleDetail:
        "The lab's work in molecular interpretation and functional follow-up fits naturally into the needs of the Undiagnosed Diseases Network.",
      overview:
        "UDN brings together clinicians, genomic investigators, and functional scientists to solve difficult cases that demand deeper biological context.",
      labContribution:
        "The lab contributes approaches that connect rare variants to expression, molecular consequence, and disease-relevant mechanism.",
      highlights: [
        "Difficult-to-solve clinical cases",
        "Functional genomics for diagnosis",
        "Close link between sequencing results and biological mechanism",
      ],
    },
    {
      id: "encode4",
      shortName: "ENCODE4",
      name: "ENCODE4",
      href: "consortia/encode4.html",
      role: "Investigator",
      focus: "Reference regulatory maps and functional annotation.",
      logo: "assets/consortium_logos/encode2.png",
      summary:
        "ENCODE4 extends foundational work on regulatory annotation and the reference maps needed to interpret human genomes.",
      roleDetail:
        "Participation in ENCODE4 reflects the lab's investment in functional annotation, regulatory biology, and shared genomic infrastructure.",
      overview:
        "Reference maps of regulatory activity remain essential for interpreting how variants alter function, especially outside coding sequence.",
      labContribution:
        "The lab's research on gene regulation, expression, and the molecular impact of variation is tightly aligned with ENCODE's broader goals.",
      highlights: [
        "Reference regulatory annotation",
        "Functional maps for variant interpretation",
        "Shared infrastructure for modern genomics",
      ],
    },
  ],
  home: {
    stats: [
      {
        value: "22",
        label: "current lab members",
        detail: "The lab's day-to-day work is carried by postdocs, graduate students, staff scientists, trainees, and administrative support.",
      },
      {
        value: "10",
        label: "major public consortia",
        detail: "Collaborative programs remain visible across rare disease, exercise biology, and functional genomics.",
      },
      {
        value: "11+",
        label: "public tools and databases",
        detail: "Including ANT-seq, EAGLE, EigenMT, ORegAnno, Path-scan, and SplicePlot.",
      },
      {
        value: "4",
        label: "core research lenses",
        detail: "Gene regulation, rare disease, consortium-scale biology, and methods development define the lab's scientific profile.",
      },
    ],
    previews: [
      {
        eyebrow: "Research",
        title: "Research directions spanning variant interpretation, gene regulation, rare disease, and population genomics.",
        text:
          "Current work ranges from transcriptome genetics and rare-disease diagnosis to population-scale resources and molecular studies of exercise and disease.",
        href: "research.html",
        label: "Explore Research",
      },
      {
        eyebrow: "Team",
        title: "A research community that spans faculty leadership, trainees, staff scientists, and alumni.",
        text:
          "Meet the people behind the lab's science, from current members to alumni who helped shape earlier phases of the group.",
        href: "team.html",
        label: "Meet the Team",
      },
      {
        eyebrow: "Resources",
        title: "Software, data portals, publication supplements, and workflow guides from the lab.",
        text:
          "Browse ANT-seq, EAGLE, EigenMT, SplicePlot, consortium portals, manuscript supplements, and practical workflow guidance used across the lab's genomics projects.",
        href: "resources.html",
        label: "View Resources",
      },
    ],
    stories: [
      {
        eyebrow: "Lab culture",
        title: "Scientific seriousness and a sense of humor can coexist",
        text:
          "The Montgomery Lab has never been only whiteboards and pipelines. Costumes, themed photos, and inside jokes sit comfortably alongside high-dimensional genomics.",
        image: "assets/generated/home/eqtl-costume.webp",
        alt: "Montgomery Lab members in eQTL-themed costumes",
      },
      {
        eyebrow: "Community",
        title: "Collaboration continues well outside the formal workday",
        text:
          "Escape rooms, dinners, and off-campus events reflect the lab's collaborative style and the friendships that often grow around shared projects.",
        image: "assets/generated/home/escape-room.webp",
        alt: "Montgomery Lab members posing after an escape room outing",
      },
      {
        eyebrow: "Environment",
        title: "Bay Area life still shows up in the lab's rhythm",
        text:
          "Hikes and outdoor gatherings are part of the social fabric around the lab, balancing data-intensive science with a distinctly Northern California backdrop.",
        image: "assets/generated/home/lab-hike.webp",
        alt: "Montgomery Lab members on a hike",
      },
    ],
  },
  research: {
    pillars: [
      {
        eyebrow: "Gene regulation",
        title: "From variant to molecular phenotype",
        text:
          "The lab studies how and why genes turn on and off, how those effects vary between people, and how expression and splicing help explain human traits and disease.",
        bullets: [
          "Gene expression and regulation as a core explanatory layer",
          "Expression outliers and rare-variant interpretation",
          "Structural variation and understudied RNA biology",
        ],
        accent: "blue",
      },
      {
        eyebrow: "Rare disease",
        title: "Mechanistic work with diagnostic consequence",
        text:
          "The lab develops molecular outlier and multi-omic approaches to identify pathogenic variation and improve rare-disease diagnosis.",
        bullets: [
          "GREGoR and UDN-facing disease interpretation",
          "Multi-omic strategies for unsolved diagnoses",
          "A translational path from sequencing to mechanism",
        ],
        accent: "cardinal",
      },
      {
        eyebrow: "Consortium-scale biology",
        title: "Questions that require shared infrastructure",
        text:
          "The lab operates inside major collaborative programs where transcriptomic, proteomic, epigenomic, and phenotypic measurements can be interpreted at scale.",
        bullets: [
          "GTEx and Developmental GTEx",
          "MoTrPAC exercise molecular atlases",
          "TOPMed, IGVF, SMaHT, All of Us, and ENCODE4",
        ],
        accent: "teal",
      },
      {
        eyebrow: "Methods",
        title: "Computational and statistical genomics that leaves reusable tools behind",
        text:
          "The group's output is not only papers. It includes browsers, methods, and computational resources that other groups can actually use.",
        bullets: [
          "EAGLE, EigenMT, ANT-seq, Path-scan, SplicePlot",
          "Project-level code and data resources",
          "Computational tools and data resources used across the genomics community",
        ],
        accent: "gold",
      },
    ],
    activeProjects: [
      {
        title: "MoTrPAC",
        status: "in progress",
        text: "Multi-omic exercise biology with a public data portal and active consortium work.",
        href: "https://www.motrpac.org/",
      },
      {
        title: "GTEx v8 Local Ancestry",
        status: "published",
        text: "Ancestry-aware regulatory interpretation built on GTEx v8.",
        href: "https://github.com/nicolerg/gtex-admixture-la",
      },
      {
        title: "GTEx v8 lncRNAs",
        status: "under review",
        text: "Long non-coding RNA biology in GTEx-scale transcriptomic data.",
        href: "publications.html",
      },
      {
        title: "GTEx v8 rare variants",
        status: "under review",
        text: "Rare-variant interpretation grounded in tissue-scale expression data.",
        href: "publications.html",
      },
      {
        title: "Rare variant multi-omics impact",
        status: "published",
        text: "Connecting rare variation to multi-omic molecular consequence.",
        href: "publications.html",
      },
      {
        title: "ADRC Multi-omics",
        status: "in progress",
        text: "Neurodegeneration-facing multi-omic work connected to the lab's broader interests in aging and disease biology.",
        href: "publications.html",
      },
      {
        title: "African transcriptomics resource colocalization",
        status: "in progress",
        text: "Cross-population colocalization work built around African QTL resources and ancestry-matched regulatory interpretation.",
        href: "research.html",
      },
    ],
  },
  publications: {
    featured: [
      {
        year: "2010",
        title: "Whole-genome and transcriptome integration in human populations",
        detail:
          "The public PI profile highlights these early papers as foundational to the lab's direction in transcriptome genetics.",
        href: "https://med.stanford.edu/profiles/stephen-montgomery",
      },
      {
        year: "2017",
        title: "GTEx analyses of genetic effects on expression across tissues",
        detail:
          "GTEx remains a defining reference point for the lab's work on regulatory effects across the human body.",
        href: "https://www.nature.com/articles/nature24277",
      },
      {
        year: "2024",
        title: "MoTrPAC molecular effects of exercise training",
        detail:
          "Stanford coverage and public profile text both point to 2024 as a major recent milestone for the lab.",
        href: "https://med.stanford.edu/news/all-news/2024/05/exercise-molecular-changes.html",
      },
    ],
    readingList: [
      "Gene regulation and expression QTL studies",
      "Rare-variant molecular outlier methods",
      "Structural variation and copy-number consequence",
      "Exercise-responsive multi-omic biology",
      "Understudied RNA and lncRNA function",
    ],
  },
  resources: {
    categories: [
      {
        title: "Public lab tools",
        items: [
          { label: "ANT-seq", href: "https://github.com/boxiangliu/ANTseq" },
          { label: "EAGLE", href: "https://davidaknowles.github.io/eagle/" },
          { label: "EigenMT", href: "https://github.com/joed3/eigenMT" },
          { label: "ORegAnno", href: "https://plone.bcgsc.ca/platform/bioinfo/software/ORegAnno" },
          { label: "Path-scan", href: "https://psb.stanford.edu/psb-online/proceedings/psb14/daneshjou.pdf" },
          { label: "SplicePlot", href: "https://github.com/wueric/SplicePlot" },
        ],
        text: "Software, databases, and method pages associated with the lab's work in ancestry inference, regulatory annotation, QTL analysis, and variant interpretation.",
      },
      {
        title: "Manuscripts and supplemental pages",
        items: [
          { label: "Smooth muscle cell eQTL and sQTL summary statistics", href: "https://stanford.box.com/s/e6e8hyft5u7wix1nzg5mjfqa084c4tin" },
          { label: "Sardinia regulatory variation supplemental code", href: "https://github.com/zaczap/sardinia" },
          { label: "Kukurba et al. supplemental page", href: "https://smontgomlab.github.io/resources/kukurba2013/index.html" },
          { label: "Montgomery et al. 2010 supplemental page", href: "http://jungle.unige.ch/rnaseq_CEU60/" },
        ],
        text: "Supplemental material, summary statistics, and project-specific resources tied to publications from the lab and its collaborators.",
      },
      {
        title: "Consortium portals",
        items: [
          { label: "GREGoR", href: "https://gregor.stanford.edu/" },
          { label: "UDN Stanford", href: "https://undiagnosed.stanford.edu/" },
          { label: "MoTrPAC", href: "https://www.motrpac.org/" },
          { label: "MoTrPAC data hub", href: "https://motrpac-data.org/" },
          { label: "GTEx portal", href: "https://gtexportal.org/home/" },
          { label: "dGTEx", href: "https://dgtex.org/" },
        ],
        text: "Major collaborative programs and data portals that intersect directly with the lab's ongoing work in rare disease, regulatory genomics, and molecular atlases.",
      },
      {
        title: "Tutorials and workflow guides",
        items: [
          { label: "Stanford SCG quick start", href: "https://login.scg.stanford.edu/quick_start/" },
          { label: "Montgomery Lab SCG primer", href: "https://github.com/smontgomlab/resources/blob/master/scg_primer.md" },
          { label: "VS Code Remote SSH guide", href: "https://code.visualstudio.com/docs/remote/ssh" },
          { label: "Snakemake tutorial", href: "https://snakemake.readthedocs.io/en/stable/tutorial/tutorial.html" },
          { label: "GitHub Guides", href: "https://github.com/git-guides" },
          { label: "Stanford Montgomery Lab resources archive", href: "https://med.stanford.edu/montgomerylab/Resources.html" },
        ],
        text: "Practical material for cluster onboarding, remote development, pipeline building, and reproducible computing in genomics workflows.",
      },
      {
        title: "Operational and support links",
        items: [
          { label: "Stanford Cardinal Print", href: "https://uit.stanford.edu/service/cardinal-print" },
          { label: "Stanford mailing list tools", href: "https://uit.stanford.edu/service/mailinglists/tools" },
          { label: "Stanford VPN", href: "https://uit.stanford.edu/service/vpn" },
          { label: "BioRender", href: "https://www.biorender.com/" },
          { label: "Montgomery Lab GitHub organization", href: "https://github.com/smontgomlab" },
          { label: "Official Stanford lab page", href: "https://med.stanford.edu/montgomerylab.html" },
        ],
        text: "Everyday links for communication, remote work, printing, account setup, and shared research operations.",
      },
    ],
    featuredGuides: [
      {
        title: "Run notebooks on SCG through VS Code",
        text:
          "A practical route into cluster-based analysis using Remote SSH, interactive Slurm sessions, and notebook kernels running on compute nodes instead of local machines.",
        href: "https://code.visualstudio.com/docs/remote/ssh",
        label: "Open Remote SSH guide",
      },
      {
        title: "Build reproducible pipelines with Snakemake",
        text:
          "A solid starting point for dry runs, DAG inspection, cluster execution, and workflow structure that supports reproducible long-term analysis.",
        href: "https://snakemake.readthedocs.io/en/stable/tutorial/tutorial.html",
        label: "Open Snakemake tutorial",
      },
      {
        title: "Start on Stanford computing with the lab primer",
        text:
          "The lab's SCG primer covers the practical first moves: requesting access, choosing interactive versus batch compute, and using shared storage responsibly.",
        href: "https://github.com/smontgomlab/resources/blob/master/scg_primer.md",
        label: "Open SCG primer",
      },
    ],
    dataInventory: [
      {
        title: "GTEx and developmental regulation",
        text:
          "GTEx-scale expression and regulatory resources remain a backbone for tissue-aware interpretation across adulthood and developmental context.",
        href: "https://gtexportal.org/home/",
        label: "Open GTEx portal",
      },
      {
        title: "MoTrPAC and exercise multi-omics",
        text:
          "The lab's consortium work extends into exercise-responsive transcriptomic and systems biology data that connect physiology to molecular change.",
        href: "https://motrpac-data.org/",
        label: "Open MoTrPAC data hub",
      },
      {
        title: "Population cohorts and precision medicine",
        text:
          "TOPMed, MESA, and All of Us signal the lab's access to population-scale genomic resources that matter for ancestry, representation, and translation.",
        href: "https://topmed.nhlbi.nih.gov/",
        label: "Open TOPMed overview",
      },
      {
        title: "African QTL and ancestry-matched resources",
        text:
          "African transcriptomic resources support the lab's work on cross-population colocalization and ancestry-aware regulatory interpretation.",
        href: "https://www.gtexportal.org/home/",
        label: "Open regulatory genomics portal",
      },
      {
        title: "Rare disease and clinically oriented multi-omics",
        text:
          "Rare-disease cohorts and unsolved-case programs connect the lab's data landscape directly to diagnosis, splicing, and mechanism-first interpretation.",
        href: "https://gregor.stanford.edu/",
        label: "Open GREGoR Stanford site",
      },
    ],
  },
  join: {
    checklist: [
      {
        title: "Accounts, access, and orientation",
        text:
          "New members are onboarded into workspaces, calendars, mailing lists, shared communication channels, and day-to-day lab logistics early so they can focus quickly on science.",
      },
      {
        title: "Computing and data environment",
        text:
          "The lab's computing environment includes Stanford clusters, shared GitHub resources, and concrete guidance for running notebooks, scripts, and workflows on shared infrastructure.",
      },
      {
        title: "Required training",
        text:
          "Required research, safety, and compliance trainings are spelled out early so expectations are clear from the start.",
      },
      {
        title: "Mentorship and lab rhythm",
        text:
          "New members are encouraged to identify a primary mentor early, attend lab meeting regularly, and make active use of in-person discussion time.",
      },
    ],
    values: [
      {
        title: "Respect and collaboration",
        text:
          "The lab sets a collaborative tone: ask questions early, share context generously, and treat teamwork as part of the scientific method.",
      },
      {
        title: "Health matters",
        text:
          "Physical and mental health are treated as essential to sustainable research rather than something secondary to productivity.",
      },
      {
        title: "In-person scientific collisions",
        text:
          "Regular in-person time matters because many of the best project ideas and troubleshooting conversations happen face to face.",
      },
      {
        title: "Structured onboarding",
        text:
          "Joining the lab comes with concrete setup steps, shared tools, and clear routes for getting help rather than a sink-or-swim approach.",
      },
    ],
    audiences: [
      {
        title: "Postdoctoral applicants",
        text:
          "Email Stephen Montgomery at smontgom@stanford.edu with a cover letter describing your research experience and the project directions that interest you, your CV, and contact information for two references. Fellowship readiness is a major plus for postdoctoral applicants.",
      },
      {
        title: "Stanford PhD rotations",
        text:
          "Stanford PhD students interested in a rotation should contact Stephen Montgomery with a short introductory note and a brief CV. The lab is connected to graduate training in Genetics and Biomedical Data Science at Stanford.",
      },
      {
        title: "Stanford undergraduates",
        text:
          "Stanford undergraduates interested in research training or PATH199 should send a short introduction, a description of their interests, and an unofficial transcript. The lab typically facilitates internships for students already enrolled at Stanford.",
      },
      {
        title: "Administrative and logistics questions",
        text:
          "Scientific applications should go to Stephen Montgomery at smontgom@stanford.edu. Stanford's current faculty profile also lists Char Armitage at carmitag@stanford.edu as the alternate administrative contact for logistics and scheduling.",
      },
    ],
    faq: [
      {
        question: "Can the lab help prospective students gain admission to Stanford?",
        answer:
          "No. Prospective students should apply through the standard admissions process for the relevant Stanford graduate program.",
      },
      {
        question: "What should a postdoc include in an initial email?",
        answer:
          "A strong first message should include a concise cover letter, a CV, a description of relevant research experience, project directions of interest in the lab, and contact information for two references.",
      },
      {
        question: "What should a rotation student send?",
        answer:
          "Stanford rotation students should send a brief introductory note and a short CV, then follow up about project fit and timing.",
      },
      {
        question: "What kind of training environment should a new member expect?",
        answer:
          "The lab emphasizes regular meeting attendance, early mentorship, shared computing resources, and a collaborative culture that mixes experimental and computational genomics.",
      },
    ],
  },
  news: {
    stories: [
      {
        eyebrow: "2024 milestone",
        title: "May 2024: MoTrPAC papers map the molecular effects of exercise training",
        text:
          "Stanford coverage in May 2024 highlighted the molecular effects of exercise training, reinforcing MoTrPAC as one of the lab's most visible recent collaborative efforts.",
        image: "assets/generated/home/hero-pictionary.webp",
        alt: "Working session in the Montgomery Lab",
      },
      {
        eyebrow: "Archive",
        title: "The GTEx paper set remains a defining reference point in the lab's history",
        text:
          "The October 17, 2017 release of the GTEx papers remains a defining milestone for the lab's work on regulation and variation across tissues.",
        image: "assets/generated/home/lab-hike.webp",
        alt: "Montgomery Lab members on a hike",
      },
      {
        eyebrow: "Consortium history",
        title: "December 2016: the lab joins MoTrPAC",
        text:
          "The lab joined MoTrPAC on December 15, 2016, establishing a long-running connection to consortium-scale exercise biology and molecular physiology.",
        image: "assets/generated/home/lab-room.webp",
        alt: "Montgomery Lab members meeting in a conference room",
      },
    ],
  },
  team: {
    leadership: {
      name: "Stephen B. Montgomery",
      role: "Principal Investigator",
      headshot: headshotsByName["Stephen B. Montgomery"],
      bio:
        "Stephen B. Montgomery is an Endowed Professor of Pathology, a Professor of Genetics, a Professor of Biomedical Data Science, and by courtesy a Professor of Computer Science at Stanford University. His research connects genetic variation to gene regulation, molecular phenotypes, and disease.",
      links: [
        { label: "Stanford profile", href: "https://med.stanford.edu/profiles/stephen-montgomery" },
        { label: "Email", href: "mailto:smontgom@stanford.edu" },
        { label: "Google Scholar", href: "https://scholar.google.com/citations?hl=en&user=117h3CAAAAAJ" },
      ],
    },
    currentMembers: currentMemberNames.map((name) => ({
        name,
        role: rolesByName[name] || "Current lab member",
        initials: makeInitials(name),
        bio: biosByName[name] || fallbackBio(name, "current"),
        detail: detailByName[name] || biosByName[name] || fallbackBio(name, "current"),
        headshot: headshotsByName[name] || "",
        headshotPosition: headshotPositionByName[name] || "",
      })),
    rotationStudents: rotationStudentNames.map((name) => ({
      name,
      role: "Rotation student",
      initials: makeInitials(name),
      bio: biosByName[name] || fallbackBio(name, "rotation"),
      detail: detailByName[name] || biosByName[name] || fallbackBio(name, "rotation"),
      headshot: headshotsByName[name] || "",
      headshotPosition: headshotPositionByName[name] || "",
    })),
    alumni: formerMembers.map((member) => ({
      ...member,
      role: rolesByName[member.name] || "Former lab member",
      initials: makeInitials(member.name),
      bio: biosByName[member.name] || fallbackBio(member.name, "alumni"),
      detail: detailByName[member.name] || biosByName[member.name] || fallbackBio(member.name, "alumni"),
      headshot: headshotsByName[member.name] || "",
      headshotPosition: headshotPositionByName[member.name] || "",
    })),
    note:
      "The Montgomery Lab brings together wet-lab and dry-lab researchers working across gene regulation, disease genetics, functional genomics, rare disease, and large collaborative genomics programs.",
  },
};
