/*
 * The temporary front page's content: the cases (as published on the old
 * Lovable site, tours on explore.nextview360.dk) and the three of us.
 */

export type Case = { slug: string; title: string; category: string; text: string; tour: string; image: string | null };

export const CASES: Case[] = [
  { slug: "fitness-united", title: "Fitness United", category: "Fitness", text: "Professionel 360°-tur der viser træningsfaciliteterne frem på en klar og indbydende måde – så potentielle medlemmer kan mærke stedet, før de booker.", tour: "https://explore.nextview360.dk/da/tour/fitnessunitedrisskov", image: "/site/cases/fitness-united.jpg" },
  { slug: "restaurant-fusion", title: "Skovbegravelse Horsens", category: "Restaurant", text: "Interaktiv rundvisning af restauranten, der giver gæsterne en realistisk fornemmelse af stemning, indretning og bordplacering.", tour: "https://explore.nextview360.dk/da/tour/stensballegaardskovbegravelsesplads", image: "/site/cases/restaurant-fusion.jpg" },
  { slug: "funart", title: "FunArt", category: "Oplevelse", text: "360°-oplevelse der fremviser det kreative univers og gør det nemt for besøgende at forstå konceptet og booke.", tour: "https://explore.nextview360.dk/da/tour/ajjwjmq3ye", image: "/site/cases/funart.jpg" },
  { slug: "mikmik", title: "MikMik", category: "Restaurant", text: "Virtuel tur af den nye thai-restaurant, der viser lokalet, atmosfæren og gør det nemt at booke bord direkte.", tour: "https://explore.nextview360.dk/da/tour/mikmikaalborg", image: "/site/cases/mikmik.jpg" },
  { slug: "padel99", title: "Padel99", category: "Sport", text: "360°-visning af padelbaner og faciliteter, så kunder hurtigt kan danne sig et indtryk og booke banetid.", tour: "https://explore.nextview360.dk/da/tour/padel99", image: "/site/cases/padel99.jpg" },
  { slug: "voxevaerket", title: "Voxeværket", category: "Erhverv", text: "Interaktiv præsentation af lokalerne, der giver et klart overblik og hjælper potentielle lejere med at tage beslutning.", tour: "https://explore.nextview360.dk/da/tour/voxevaerketkolding", image: null },
  { slug: "teeshoppen", title: "Teeshoppen", category: "Butik", text: "360°-tur der viser butikken og produkterne frem på en overskuelig og indbydende måde.", tour: "https://explore.nextview360.dk/da/tour/teeshoppenaalborg", image: "/site/cases/teeshoppen.jpg" },
  { slug: "restaurant-roverstuen", title: "Restaurant Røverstuen", category: "Restaurant", text: "Virtuel rundvisning der fanger restaurantens stemning og gør det nemmere for gæster at vælge at booke.", tour: "https://explore.nextview360.dk/da/tour/roeverstuen", image: "/site/cases/restaurant-roverstuen.jpg" },
  { slug: "boxdepotet", title: "Boxdepotet", category: "Erhverv", text: "Klar 360°-visning af depotrum og faciliteter, så kunder nemt kan se mulighederne og tage kontakt.", tour: "https://explore.nextview360.dk/da/tour/boxdepotet-horsens", image: "/site/cases/boxdepotet.jpg" },
];

export type Person = { name: string; title: string; phone: string; email: string; photo: string };

export const TEAM: Person[] = [
  { name: "Gustav", title: "Sales Manager", phone: "+45 29 89 95 55", email: "gustav@nextview360.dk", photo: "/site/team/gustav.jpg" },
  { name: "Victor", title: "Sales & Tech Manager", phone: "+45 20 91 02 94", email: "victor@nextview360.dk", photo: "/site/team/victor.jpg" },
  { name: "Lasse", title: "Sales & Account Manager", phone: "+45 23 27 07 86", email: "lasse@nextview360.dk", photo: "/site/team/lasse.jpg" },
];
