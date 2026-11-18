// /* =========================================================
//    INDIA LOCATIONS
//    ---------------------------------------------------------
//    Static State → District → City dataset.

//    Current scope:
//    - Telangana only

//    Public helpers:
//    - getStates()
//    - getDistricts(state)
//    - getCities(state, district)

//    Later:
//    - Add Andhra Pradesh, Karnataka, Maharashtra, etc.
//      without changing the helper functions.
// ========================================================= */

// const INDIA_LOCATIONS = {
//   Telangana: {
//     Adilabad: [
//       "Adilabad",
//       "Bhainsa",
//       "Bela",
//       "Boath",
//       "Ichoda",
//       "Indervelly",
//       "Jainath",
//       "Kubeer",
//       "Mavala",
//       "Narnoor",
//       "Neradigonda",
//       "Sirikonda",
//       "Talamadugu",
//       "Tamsi",
//       "Utnoor",
//     ],

//     Bhadradri Kothagudem: [
//       "Kothagudem",
//       "Bhadrachalam",
//       "Manuguru",
//       "Palvancha",
//       "Yellandu",
//       "Aswaraopeta",
//       "Chandrugonda",
//       "Dammapeta",
//       "Dummugudem",
//       "Gundala",
//       "Julurupadu",
//       "Karakagudem",
//       "Laxmidevipalli",
//       "Mulakalapalli",
//       "Sujathanagar",
//       "Tekulapalli",
//       "Chunchupalli",
//     ],

//     Hanamkonda: [
//       "Hanamkonda",
//       "Kazipet",
//       "Hasanparthy",
//       "Atmakur",
//       "Bheemadevarpalle",
//       "Damera",
//       "Dharmasagar",
//       "Elkathurthi",
//       "Inavole",
//       "Kamalapur",
//       "Khila Warangal",
//       "Nadikuda",
//       "Parkal",
//       "Shayampet",
//       "Velair",
//     ],

//     Hyderabad: [
//       "Hyderabad",
//     ],

//     Jagtial: [
//       "Jagtial",
//       "Dharmapuri",
//       "Korutla",
//       "Metpally",
//       "Raikal",
//       "Sarangapur",
//       "Mallial",
//       "Pegadapalli",
//       "Kodimial",
//       "Gollapalli",
//       "Kathlapur",
//       "Ibrahimpatnam",
//       "Medipalli",
//       "Beerpur",
//       "Velgatur",
//     ],

//     Jangaon: [
//       "Jangaon",
//       "Bachannapet",
//       "Devaruppula",
//       "Ghanpur",
//       "Kodakandla",
//       "Lingalaghanpur",
//       "Narmetta",
//       "Palakurthi",
//       "Raghunathpalle",
//       "Station Ghanpur",
//       "Zaffergadh",
//     ],

//     Jayashankar Bhupalpally: [
//       "Bhupalpally",
//       "Chityal",
//       "Ghanpur Mulug",
//       "Kataram",
//       "Mahadevpur",
//       "Malharrao",
//       "Mogullapalle",
//       "Palimela",
//       "Regonda",
//       "Tekumatla",
//     ],

//     Jogulamba Gadwal: [
//       "Gadwal",
//       "Alampur",
//       "Dharur",
//       "Ghattu",
//       "Ieeja",
//       "Kaloor Timmanadoddi",
//       "Maldakal",
//       "Manopad",
//       "Rajoli",
//       "Undavelly",
//       "Waddepally",
//     ],

//     Kamareddy: [
//       "Kamareddy",
//       "Banswada",
//       "Bichkunda",
//       "Bhiknoor",
//       "Domakonda",
//       "Ellareddy",
//       "Gandhari",
//       "Jukkal",
//       "Lingampet",
//       "Machareddy",
//       "Madnur",
//       "Nagireddypet",
//       "Nizamsagar",
//       "Pedda Kodapgal",
//       "Rajampet",
//       "Ramareddy",
//       "Tadwai",
//     ],

//     Karimnagar: [
//       "Karimnagar",
//       "Choppadandi",
//       "Gangadhara",
//       "Ganneruvaram",
//       "Huzurabad",
//       "Jammikunta",
//       "Keshavapatnam",
//       "Manakondur",
//       "Ramadugu",
//       "Saidapur",
//       "Shankarapatnam",
//       "Thimmapur",
//       "Veenavanka",
//     ],

//     Khammam: [
//       "Khammam",
//       "Bonakal",
//       "Chinthakani",
//       "Enkoor",
//       "Kallur",
//       "Kamepally",
//       "Konijerla",
//       "Kusumanchi",
//       "Madhira",
//       "Mudigonda",
//       "Nelakondapalle",
//       "Penuballi",
//       "Raghunathapalem",
//       "Sathupalli",
//       "Singareni",
//       "Thallada",
//       "Wyra",
//       "Yerrupalem",
//     ],

//     Komaram_Bheem_Asifabad: [
//       "Asifabad",
//       "Bejjur",
//       "Chintalamanepally",
//       "Dahegaon",
//       "Jainoor",
//       "Kagaznagar",
//       "Kerameri",
//       "Kouthala",
//       "Lingapur",
//       "Penchikalpet",
//       "Rebbena",
//       "Sirpur",
//       "Sirpur_U",
//       "Tiryani",
//       "Wankidi",
//     ],

//     Mahabubabad: [
//       "Mahabubabad",
//       "Bayyaram",
//       "Chinnagudur",
//       "Danthalapalle",
//       "Dornakal",
//       "Gudur",
//       "Gangaram",
//       "Garla",
//       "Kesamudram",
//       "Kuravi",
//       "Narsimhulapet",
//       "Peddavangara",
//       "Thorrur",
//     ],

//     Mahbubnagar: [
//       "Mahbubnagar",
//       "Addakal",
//       "Balanagar",
//       "Bhoothpur",
//       "Chinna Chintakunta",
//       "Devarakadra",
//       "Gandeed",
//       "Hanwada",
//       "Jadcherla",
//       "Koilkonda",
//       "Midjil",
//       "Moosapet",
//       "Nawabpet",
//       "Rajapur",
//     ],

//     Mancherial: [
//       "Mancherial",
//       "Bellampalli",
//       "Bheemaram",
//       "Chennur",
//       "Dandepally",
//       "Hajipur",
//       "Jaipur",
//       "Jannaram",
//       "Kannepalli",
//       "Kasipet",
//       "Kotapalli",
//       "Luxettipet",
//       "Mandamarri",
//       "Naspur",
//       "Vemanpally",
//     ],

//     Medak: [
//       "Medak",
//       "Alladurg",
//       "Chegunta",
//       "Haveli Ghanpur",
//       "Kowdipalli",
//       "Kulcharam",
//       "Manoharabad",
//       "Masaipet",
//       "Medak Rural",
//       "Narsapur",
//       "Narsingi",
//       "Papannapet",
//       "Ramayampet",
//       "Regode",
//       "Shankarampet A",
//       "Shankarampet R",
//       "Tekmal",
//     ],

//     Medchal_Malkajgiri: [
//       "Medchal",
//       "Alwal",
//       "Bachupally",
//       "Balanagar",
//       "Dundigal Gandimaisamma",
//       "Kapra",
//       "Keesara",
//       "Kukatpally",
//       "Malkajgiri",
//       "Medipally",
//       "Quthbullapur",
//       "Shamirpet",
//       "Uppal",
//     ],

//     Mulugu: [
//       "Mulugu",
//       "Eturnagaram",
//       "Govindaraopet",
//       "Kannaigudem",
//       "Mangapet",
//       "Mogullapalle",
//       "Tadvai",
//       "Venkatapur",
//       "Venkatapuram",
//       "Wazeed",
//     ],

//     Nagarkurnool: [
//       "Nagarkurnool",
//       "Achampet",
//       "Bijinapally",
//       "Charakonda",
//       "Kalwakurthy",
//       "Kodair",
//       "Kollapur",
//       "Lingal",
//       "Padara",
//       "Pentlavelli",
//       "Peddakothapally",
//       "Telkapalle",
//       "Tadoor",
//       "Uppununthala",
//       "Vangoor",
//       "Veldanda",
//     ],

//     Nalgonda: [
//       "Nalgonda",
//       "Chandur",
//       "Chityal",
//       "Chintha Pally",
//       "Devarakonda",
//       "Gundlapally",
//       "Kanagal",
//       "Kattangur",
//       "Kethepally",
//       "Madugulapally",
//       "Marriguda",
//       "Miryalaguda",
//       "Munugode",
//       "Nakrekal",
//       "Nampally",
//       "Narketpally",
//       "Nidamanur",
//       "Peddavoora",
//       "Shaligouraram",
//       "Thipparthi",
//       "Tripuraram",
//     ],

//     Narayanpet: [
//       "Narayanpet",
//       "Damaragidda",
//       "Dhanwada",
//       "Kosgi",
//       "Krishna",
//       "Maddur",
//       "Makthal",
//       "Maganoor",
//       "Marikal",
//       "Narva",
//       "Utkoor",
//     ],

//     Nirmal: [
//       "Nirmal",
//       "Basar",
//       "Bela",
//       "Bhainsa",
//       "Dilawarpur",
//       "Kaddam Peddur",
//       "Khanapur",
//       "Kubeer",
//       "Kuntala",
//       "Laxmanchanda",
//       "Lokeshwaram",
//       "Mamada",
//       "Mudhole",
//       "Sarangapur",
//       "Soan",
//       "Tanoor",
//     ],

//     Nizamabad: [
//       "Nizamabad",
//       "Armoor",
//       "Balkonda",
//       "Bheemgal",
//       "Bodhan",
//       "Dichpally",
//       "Jakranpally",
//       "Kammarpally",
//       "Kotgiri",
//       "Makloor",
//       "Mortad",
//       "Navipet",
//       "Nandipet",
//       "Ranjal",
//       "Sirikonda",
//       "Yergatla",
//     ],

//     Peddapalli: [
//       "Peddapalli",
//       "Anthargaon",
//       "Dharmaram",
//       "Eligaid",
//       "Julapalli",
//       "Kamanpur",
//       "Manthani",
//       "Odela",
//       "Palakurthy",
//       "Ramagundam",
//       "Sultanabad",
//       "Srirampur",
//     ],

//     Rajanna_Sircilla: [
//       "Sircilla",
//       "Boinpalli",
//       "Chandurthi",
//       "Gambhiraopet",
//       "Illanthakunta",
//       "Konaraopet",
//       "Mustabad",
//       "Rudrangi",
//       "Thangallapalli",
//       "Vemulawada",
//       "Yellareddypet",
//     ],

//     Rangareddy: [
//       "Ibrahimpatnam",
//       "Kandukur",
//       "Maheshwaram",
//       "Manchal",
//       "Moinabad",
//       "Shabad",
//       "Shamshabad",
//       "Shankarpalle",
//       "Chevella",
//       "Hayathnagar",
//       "Rajendranagar",
//       "Serilingampally",
//       "Saroornagar",
//       "Balapur",
//     ],

//     Sangareddy: [
//       "Sangareddy",
//       "Ameenpur",
//       "Andole",
//       "Gummadidala",
//       "Hathnoora",
//       "Jinnaram",
//       "Jharasangam",
//       "Jinnaram",
//       "Kandi",
//       "Kohir",
//       "Kondapur",
//       "Manoor",
//       "Munipally",
//       "Narayankhed",
//       "Patancheru",
//       "Pulkal",
//       "Raikode",
//       "Sadasivpet",
//       "Sirgapoor",
//       "Vatpally",
//       "Zaheerabad",
//     ],

//     Siddipet: [
//       "Siddipet",
//       "Bejjanki",
//       "Cherial",
//       "Chinnakodur",
//       "Dubbak",
//       "Gajwel",
//       "Husnabad",
//       "Koheda",
//       "Komuravelli",
//       "Kondapak",
//       "Markook",
//       "Mirdoddi",
//       "Mulug",
//       "Nangnoor",
//       "Raipole",
//       "Thoguta",
//       "Wargal",
//     ],

//     Suryapet: [
//       "Suryapet",
//       "Atmakur",
//       "Chilkur",
//       "Chivvemla",
//       "Garidepally",
//       "Huzurnagar",
//       "Jajireddygudem",
//       "Kodad",
//       "Maddirala",
//       "Mattampally",
//       "Mellacheruvu",
//       "Mothey",
//       "Munagala",
//       "Nadigudem",
//       "Nereducherla",
//       "Nuthankal",
//       "Palakeedu",
//       "Penpahad",
//       "Thirumalagiri",
//     ],

//     Vikarabad: [
//       "Vikarabad",
//       "Bantwaram",
//       "Basheerabad",
//       "Bomraspet",
//       "Doma",
//       "Doulthabad",
//       "Kodangal",
//       "Kulkacharla",
//       "Marpally",
//       "Mominpet",
//       "Nawabpet",
//       "Pargi",
//       "Peddemul",
//       "Pudur",
//       "Tandur",
//       "Yalal",
//     ],

//     Wanaparthy: [
//       "Wanaparthy",
//       "Atmakur",
//       "Chinnambavi",
//       "Ghanpur",
//       "Gopalpet",
//       "Kothakota",
//       "Madanapur",
//       "Pebbair",
//       "Pangal",
//       "Peddamandadi",
//       "Revally",
//       "Srirangapur",
//       "Veepangandla",
//     ],

//     Warangal: [
//       "Warangal",
//       "Atmakur",
//       "Chennaraopet",
//       "Duggondi",
//       "Geesugonda",
//       "Khanapur",
//       "Nallabelly",
//       "Narsampet",
//       "Nekkonda",
//       "Parvathagiri",
//       "Rayaparthy",
//       "Sangem",
//       "Wardhannapet",
//     ],

//     Yadadri_Bhuvanagiri: [
//       "Bhongir",
//       "Alair",
//       "Atmakur",
//       "Bommalaramaram",
//       "Bibinagar",
//       "Choutuppal",
//       "Gundala",
//       "Motakondur",
//       "Mothkur",
//       "Pochampally",
//       "Rajapet",
//       "Ramannapet",
//       "Turkapally",
//       "Valigonda",
//       "Yadagirigutta",
//     ],
//   },
// };

// /* =========================================================
//    HELPERS
// ========================================================= */

// /**
//  * Get all available states.
//  *
//  * @returns {string[]}
//  */
// export const getStates = () => {
//   return Object.keys(INDIA_LOCATIONS);
// };

// /**
//  * Get districts belonging to a state.
//  *
//  * @param {string} state
//  * @returns {string[]}
//  */
// export const getDistricts = (state) => {
//   if (!state) return [];

//   return Object.keys(INDIA_LOCATIONS[state] || {});
// };

// /**
//  * Get cities belonging to a state + district.
//  *
//  * @param {string} state
//  * @param {string} district
//  * @returns {string[]}
//  */
// export const getCities = (state, district) => {
//   if (!state || !district) return [];

//   return INDIA_LOCATIONS[state]?.[district] || [];
// };

// export default INDIA_LOCATIONS;