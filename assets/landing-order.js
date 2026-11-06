// Curated source orders for CSS dense placement, keeping the four clusters connected
// at desktop widths without runtime search. One column uses the thematic HTML order.
// When adding/removing a card, update every arrangement and run the landing browser test.
/** @type {Record<number, string[]>} */
export const landingOrders = {
  2: "intuitions ceo-salary-benchmark forecast-calibration layout-gui color-optimization sankey raster-to-vector crossword signature message-collage name-tags text-in-image helix photomosaic seating b64 pocket-language-guide agendamatic".split(' '),
  4: "intuitions forecast-calibration ceo-salary-benchmark color-optimization layout-gui sankey message-collage helix crossword signature raster-to-vector name-tags photomosaic text-in-image b64 pocket-language-guide agendamatic seating".split(' '),
  5: "intuitions ceo-salary-benchmark forecast-calibration text-in-image crossword message-collage sankey layout-gui color-optimization photomosaic helix signature raster-to-vector name-tags seating pocket-language-guide b64 agendamatic".split(' '),
  6: "intuitions sankey ceo-salary-benchmark forecast-calibration color-optimization name-tags layout-gui message-collage raster-to-vector signature crossword helix text-in-image photomosaic pocket-language-guide agendamatic seating b64".split(' '),
  7: "intuitions forecast-calibration ceo-salary-benchmark photomosaic name-tags signature raster-to-vector crossword helix text-in-image message-collage seating pocket-language-guide layout-gui sankey color-optimization agendamatic b64".split(' '),
  8: "intuitions ceo-salary-benchmark color-optimization layout-gui forecast-calibration sankey text-in-image raster-to-vector crossword helix signature name-tags message-collage pocket-language-guide seating agendamatic b64 photomosaic".split(' '),
  9: "intuitions forecast-calibration ceo-salary-benchmark b64 pocket-language-guide seating layout-gui sankey color-optimization agendamatic message-collage text-in-image photomosaic crossword raster-to-vector signature name-tags helix".split(' '),
  10: "intuitions ceo-salary-benchmark layout-gui sankey forecast-calibration helix raster-to-vector message-collage crossword color-optimization signature name-tags photomosaic text-in-image b64 pocket-language-guide agendamatic seating".split(' '),
};
