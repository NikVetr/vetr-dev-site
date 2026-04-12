const photoPool = [
  { key: "lab-room.webp", src: "assets/generated/home/lab-room.webp", alt: "Montgomery Lab members in a conference room working session", caption: "Working session with active whiteboards, discussion, and project troubleshooting." },
  { key: "team-group.webp", src: "assets/generated/home/team-group.webp", alt: "Montgomery Lab group portrait", caption: "A broad lab group portrait spanning experimental, computational, and translational work." },
  { key: "hero-pictionary.webp", src: "assets/generated/home/hero-pictionary.webp", alt: "Montgomery Lab members around a table during a group activity", caption: "A group table moment from the lab's in-person community rhythm." },
  { key: "pictionary-room.webp", src: "assets/generated/home/pictionary-room.webp", alt: "Montgomery Lab members gathered during a Pictionary event", caption: "A whiteboard-heavy lab culture moment outside formal project meetings." },
  { key: "resources-pictionary.webp", src: "assets/generated/page-hero/resources-pictionary.webp", alt: "Montgomery Lab members in a wide group working session", caption: "Group work around shared tools, workflows, and practical scientific exchange." },
  { key: "lab-dinner.webp", src: "assets/generated/home/lab-dinner.webp", alt: "Montgomery Lab members gathered at a dinner", caption: "Lab members gathered around a dinner table outside the usual work setting." },
  { key: "lab-dinner-portrait.webp", src: "assets/generated/home/lab-dinner-portrait.webp", alt: "Montgomery Lab members at a holiday dinner table", caption: "A close dinner-table portrait from a lab gathering." },
  { key: "join-retreat-dinner.webp", src: "assets/generated/page-hero/join-retreat-dinner.webp", alt: "Montgomery Lab members gathered together over a meal", caption: "Shared meals and retreats are part of how the lab community stays connected." },
  { key: "escape-room.webp", src: "assets/generated/home/escape-room.webp", alt: "Montgomery Lab members posing after an escape room outing", caption: "An escape-room outing from the lab's off-campus social archive." },
  { key: "lab-hike.webp", src: "assets/generated/home/lab-hike.webp", alt: "Montgomery Lab members on a hike", caption: "Bay Area hikes and outdoor gatherings around the lab community." },
  { key: "contact-beach-group.webp", src: "assets/generated/page-hero/contact-beach-group.webp", alt: "Montgomery Lab members standing together on a beach", caption: "A beach-group photo from the lab's wider social orbit." },
  { key: "lab-social.webp", src: "assets/generated/home/lab-social.webp", alt: "Montgomery Lab members at a social event", caption: "A casual lab gathering that broadens the story beyond papers and meetings." },
  { key: "eqtl-costume.webp", src: "assets/generated/home/eqtl-costume.webp", alt: "Montgomery Lab members in eQTL-themed costumes", caption: "A themed eQTL costume moment from the lab archive." },
  { key: "publications-ashg.webp", src: "assets/generated/page-hero/publications-ashg.webp", alt: "Large scientific meeting audience during a genomics conference session", caption: "Conference-scale genomics, publication exchange, and public scientific discussion." },
];

const offsets = new Map(photoPool.map((item, index) => [item.key, (index * 3) % photoPool.length]));
const photoMap = new Map(photoPool.map((item) => [item.key, item]));
const pageSeeds = {
  home: 0,
  research: 2,
  publications: 4,
  team: 6,
  consortia: 8,
  resources: 10,
  join: 12,
  news: 3,
  contact: 5,
};
let carouselSerial = 0;

const pagePools = {
  home: ["lab-room.webp", "team-group.webp", "eqtl-costume.webp", "escape-room.webp", "lab-hike.webp", "lab-social.webp", "lab-dinner.webp", "contact-beach-group.webp"],
  research: ["lab-room.webp", "hero-pictionary.webp", "resources-pictionary.webp", "pictionary-room.webp", "team-group.webp", "eqtl-costume.webp", "lab-social.webp", "contact-beach-group.webp"],
  publications: ["publications-ashg.webp", "lab-social.webp", "team-group.webp", "lab-dinner-portrait.webp", "join-retreat-dinner.webp", "contact-beach-group.webp", "lab-room.webp", "escape-room.webp"],
  team: ["team-group.webp", "join-retreat-dinner.webp", "lab-dinner.webp", "lab-dinner-portrait.webp", "contact-beach-group.webp", "escape-room.webp", "lab-social.webp", "lab-hike.webp"],
  consortia: ["lab-social.webp", "contact-beach-group.webp", "resources-pictionary.webp", "lab-room.webp", "team-group.webp", "join-retreat-dinner.webp", "lab-hike.webp", "escape-room.webp"],
  resources: ["resources-pictionary.webp", "hero-pictionary.webp", "pictionary-room.webp", "lab-room.webp", "eqtl-costume.webp", "lab-social.webp", "team-group.webp", "contact-beach-group.webp"],
  join: ["join-retreat-dinner.webp", "lab-dinner.webp", "lab-dinner-portrait.webp", "contact-beach-group.webp", "team-group.webp", "escape-room.webp", "lab-hike.webp", "lab-social.webp"],
  news: ["publications-ashg.webp", "lab-social.webp", "team-group.webp", "lab-room.webp", "contact-beach-group.webp", "escape-room.webp", "lab-hike.webp", "hero-pictionary.webp"],
  contact: ["contact-beach-group.webp", "lab-social.webp", "team-group.webp", "lab-hike.webp", "join-retreat-dinner.webp", "escape-room.webp", "lab-dinner.webp", "lab-room.webp"],
};

const keyFromSrc = (src = "") => {
  const match = src.match(/([^/]+\.webp)(?:[?#].*)?$/);
  return match?.[1] || "";
};

const pathPrefix = (src = "") => {
  const match = src.match(/^(.*assets\/generated\/)/);
  return match?.[1] || "assets/generated/";
};

const resolveSrc = (src, currentSrc) => `${pathPrefix(currentSrc)}${src.split("assets/generated/")[1]}`;

const makeSet = (key, salt = 0) => {
  const current = photoPool.find((item) => item.key === key);

  if (!current) {
    return [];
  }

  const pageId = document.body.dataset.page || "home";
  const basePool = (pagePools[pageId] || photoPool.map((item) => item.key))
    .map((poolKey) => photoMap.get(poolKey))
    .filter(Boolean);
  const fallbackPool = photoPool.filter((item) => !basePool.some((candidate) => candidate.key === item.key));
  const scopedPool = [...basePool, ...fallbackPool];
  const pageSeed = pageSeeds[pageId] || 0;
  const start = ((offsets.get(key) || 0) + pageSeed + salt * 3) % scopedPool.length;
  const rotated = Array.from({ length: scopedPool.length }, (_, index) => scopedPool[(start + index) % scopedPool.length]);
  return [current, ...rotated.filter((item) => item.key !== key)].slice(0, 8);
};

const carouselContainer = (img) => {
  const parent = img.parentElement;

  if (!parent || img.closest(".photo-carousel")) {
    return null;
  }

  if (parent.classList.contains("page-hero-card") || parent.classList.contains("hero-side-card")) {
    const wrapper = document.createElement("div");
    wrapper.className = "photo-carousel photo-carousel-wrap";
    parent.insertBefore(wrapper, img);
    wrapper.appendChild(img);
    return wrapper;
  }

  parent.classList.add("photo-carousel");
  return parent;
};

const captionTarget = (container) =>
  container.querySelector(":scope > figcaption") ||
  container.querySelector(":scope > .hero-caption strong") ||
  container.querySelector(":scope > .frame-caption p:last-child");

const updateCarousel = (container, index) => {
  const items = container._photoItems;
  const img = container.querySelector("img");
  const item = items[index];

  if (!img || !item) {
    return;
  }

  container._photoIndex = index;
  img.src = resolveSrc(item.src, container._sourceSrc);
  img.alt = item.alt;
  const nativeCaption = captionTarget(container);
  const overlayCaption = container.querySelector(".photo-carousel-caption");

  if (nativeCaption) {
    nativeCaption.textContent = item.caption;
  } else if (overlayCaption) {
    overlayCaption.textContent = item.caption;
  }

  container.querySelectorAll(".photo-carousel-dot").forEach((dot, dotIndex) => {
    dot.classList.toggle("is-active", dotIndex === index);
    dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
  });
};

const attachCarousel = (img) => {
  const key = keyFromSrc(img.getAttribute("src"));
  const items = makeSet(key, carouselSerial);
  carouselSerial += 1;

  if (items.length < 2) {
    return;
  }

  const container = carouselContainer(img);

  if (!container) {
    return;
  }

  container._sourceSrc = img.getAttribute("src");
  container._photoItems = items;
  container._photoIndex = 0;
  container.insertAdjacentHTML(
    "beforeend",
    `
      <button class="photo-carousel-side photo-carousel-prev" type="button" aria-label="Previous photo" data-dir="-1"></button>
      <button class="photo-carousel-side photo-carousel-next" type="button" aria-label="Next photo" data-dir="1"></button>
      <div class="photo-carousel-dots" aria-label="Choose photo">
        ${items.map((_, index) => `<button class="photo-carousel-dot${index === 0 ? " is-active" : ""}" type="button" aria-label="Show photo ${index + 1}" data-index="${index}" aria-current="${index === 0 ? "true" : "false"}"></button>`).join("")}
      </div>
      ${captionTarget(container) ? "" : '<div class="photo-carousel-caption"></div>'}
    `
  );

  container.addEventListener("click", (event) => {
    const side = event.target.closest(".photo-carousel-side");
    const dot = event.target.closest(".photo-carousel-dot");

    if (side) {
      updateCarousel(container, (container._photoIndex + Number(side.dataset.dir) + items.length) % items.length);
    }

    if (dot) {
      updateCarousel(container, Number(dot.dataset.index));
    }
  });
  updateCarousel(container, 0);
};

const initPhotoCarousels = (selector) => {
  document.querySelectorAll(selector).forEach(attachCarousel);
};

export { initPhotoCarousels };
