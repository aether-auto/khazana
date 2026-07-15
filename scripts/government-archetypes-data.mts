/**
 * The hand-authored Government Structure archetype library
 * (2026-07-07-atlas-government-structure-design.md §3.5, §4.2).
 *
 * This is a DATA module, not AI-generated content: every archetype below is a
 * deterministic, abstract skeleton — generic slots (e.g. "head-of-state",
 * "lower-house") and generic power-flow edges whose `defaultBasis` text
 * describes a FAMILY convention ("characteristic of a parliamentary system's
 * confidence convention"), never a specific country's constitutional
 * citation, article number, or proper noun. Real per-country data fills the
 * slots at assembly time (gov-assembler task); the archetype only supplies
 * the deterministic skeleton the "no dataset gives you a diagram" gap (§2)
 * needs.
 *
 * The ~14 families are exactly those §4.2 lists: Westminster parliamentary,
 * continental parliamentary (constructive no-confidence), US-style
 * presidential, Latin American presidential (with an electoral branch),
 * French-style semi-presidential, Russian-style semi-presidential,
 * directorial/collegial (Swiss Federal Council), constitutional monarchy,
 * absolute monarchy, one-party state (party-state parallel structure),
 * military junta / provisional, theocratic, assembly-elected-president
 * hybrid, and a generic/other fallback.
 */
import type { GovArchetype, GovArchetypeLibrary } from "../packages/core/src/index.ts";

export function buildGovernmentArchetypes(): GovArchetype[] {
  return [
    {
      id: "westminster-parliamentary",
      systemType: "parliamentary",
      label: "Westminster parliamentary",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "lower-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "head-of-state",
          toSlot: "head-of-government",
          relation: "appoints",
          defaultBasis: "characteristic of a parliamentary system's ceremonial head-of-state appointment convention",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "lower-house",
          relation: "confidence",
          defaultBasis:
            "characteristic of a parliamentary system's confidence convention, where the lower house can unseat the head of government",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "lower-house",
          relation: "dissolves",
          defaultBasis: "characteristic of a parliamentary system's dissolution convention",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "cabinet",
          relation: "appoints",
          defaultBasis: "characteristic of a parliamentary system's cabinet-formation convention",
        },
        {
          fromSlot: "apex-court",
          toSlot: "lower-house",
          relation: "reviews",
          defaultBasis: "characteristic of a parliamentary system's judicial review convention",
        },
      ],
    },
    {
      id: "continental-parliamentary",
      systemType: "parliamentary",
      label: "Continental parliamentary (constructive no-confidence)",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "lower-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "upper-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "head-of-state",
          toSlot: "head-of-government",
          relation: "appoints",
          defaultBasis: "characteristic of a parliamentary system's ceremonial head-of-state appointment convention",
        },
        {
          fromSlot: "lower-house",
          toSlot: "head-of-government",
          relation: "elects",
          defaultBasis:
            "characteristic of a continental parliamentary system's constructive no-confidence convention, where the lower house elects the head of government directly",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "lower-house",
          relation: "confidence",
          defaultBasis:
            "characteristic of a continental parliamentary system's constructive no-confidence convention, where the head of government may only be unseated by the lower house simultaneously electing a successor",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "cabinet",
          relation: "appoints",
          defaultBasis: "characteristic of a parliamentary system's cabinet-formation convention",
        },
        {
          fromSlot: "apex-court",
          toSlot: "lower-house",
          relation: "reviews",
          defaultBasis: "characteristic of a parliamentary system's judicial review convention",
        },
      ],
    },
    {
      id: "us-presidential",
      systemType: "presidential",
      label: "US-style presidential",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "lower-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "upper-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "head-of-state",
          toSlot: "cabinet",
          relation: "appoints",
          defaultBasis: "characteristic of a presidential system's direct cabinet-appointment convention",
        },
        {
          fromSlot: "upper-house",
          toSlot: "cabinet",
          relation: "confirms",
          defaultBasis: "characteristic of a presidential system's upper-house confirmation convention",
        },
        {
          fromSlot: "head-of-state",
          toSlot: "lower-house",
          relation: "vetoes",
          defaultBasis:
            "characteristic of a presidential system's veto convention, with no confidence relation between the executive and the legislature",
        },
        {
          fromSlot: "apex-court",
          toSlot: "lower-house",
          relation: "reviews",
          defaultBasis: "characteristic of a presidential system's judicial review convention",
        },
        {
          fromSlot: "head-of-state",
          toSlot: "apex-court",
          relation: "appoints",
          defaultBasis: "characteristic of a presidential system's judicial appointment convention",
        },
      ],
    },
    {
      id: "latin-american-presidential",
      systemType: "presidential",
      label: "Latin American presidential (with electoral branch)",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "lower-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "upper-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
        { slot: "election-authority", branch: "electoral", tier: "national", kind: "election-authority" },
      ],
      edges: [
        {
          fromSlot: "head-of-state",
          toSlot: "cabinet",
          relation: "appoints",
          defaultBasis: "characteristic of a presidential system's direct cabinet-appointment convention",
        },
        {
          fromSlot: "upper-house",
          toSlot: "cabinet",
          relation: "confirms",
          defaultBasis: "characteristic of a presidential system's upper-house confirmation convention",
        },
        {
          fromSlot: "head-of-state",
          toSlot: "lower-house",
          relation: "vetoes",
          defaultBasis:
            "characteristic of a presidential system's veto convention, with no confidence relation between the executive and the legislature",
        },
        {
          fromSlot: "apex-court",
          toSlot: "lower-house",
          relation: "reviews",
          defaultBasis: "characteristic of a presidential system's judicial review convention",
        },
        {
          fromSlot: "election-authority",
          toSlot: "head-of-state",
          relation: "elects",
          defaultBasis:
            "characteristic of a Latin American presidential system's independent fourth-branch electoral authority verifying and certifying presidential elections",
        },
      ],
    },
    {
      id: "french-semi-presidential",
      systemType: "semi-presidential",
      label: "French-style semi-presidential",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "lower-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "head-of-state",
          toSlot: "head-of-government",
          relation: "appoints",
          defaultBasis: "characteristic of a semi-presidential system's dual-executive appointment convention",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "lower-house",
          relation: "confidence",
          defaultBasis:
            "characteristic of a semi-presidential system's convention that the head of government remains accountable to the lower house",
        },
        {
          fromSlot: "head-of-state",
          toSlot: "lower-house",
          relation: "dissolves",
          defaultBasis:
            "characteristic of a semi-presidential system's dissolution convention, exercised by the popularly elected head of state",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "cabinet",
          relation: "appoints",
          defaultBasis: "characteristic of a semi-presidential system's cabinet-formation convention",
        },
        {
          fromSlot: "apex-court",
          toSlot: "lower-house",
          relation: "reviews",
          defaultBasis: "characteristic of a semi-presidential system's judicial review convention",
        },
      ],
    },
    {
      id: "russian-semi-presidential",
      systemType: "semi-presidential",
      label: "Russian-style semi-presidential",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "lower-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "upper-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "head-of-state",
          toSlot: "head-of-government",
          relation: "appoints",
          defaultBasis: "characteristic of a semi-presidential system's dominant-executive appointment convention",
        },
        {
          fromSlot: "head-of-state",
          toSlot: "head-of-government",
          relation: "dismisses",
          defaultBasis:
            "characteristic of a semi-presidential system's convention that the head of state may remove the head of government directly, independent of the legislature",
        },
        {
          fromSlot: "lower-house",
          toSlot: "head-of-government",
          relation: "confirms",
          defaultBasis:
            "characteristic of a semi-presidential system's convention that the lower house confirms the head of government's appointment",
        },
        {
          fromSlot: "apex-court",
          toSlot: "lower-house",
          relation: "reviews",
          defaultBasis: "characteristic of a semi-presidential system's judicial review convention",
        },
      ],
    },
    {
      id: "directorial-collegial",
      systemType: "directorial",
      label: "Directorial/collegial (Swiss Federal Council)",
      institutions: [
        { slot: "collegial-executive", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "lower-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "upper-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "lower-house",
          toSlot: "collegial-executive",
          relation: "elects",
          defaultBasis:
            "characteristic of a directorial system's convention that the legislature elects the collegial executive as a body, with no confidence relation between them once elected",
        },
        {
          fromSlot: "upper-house",
          toSlot: "collegial-executive",
          relation: "elects",
          defaultBasis:
            "characteristic of a directorial system's convention that the legislature elects the collegial executive as a body, with no confidence relation between them once elected",
        },
        {
          fromSlot: "apex-court",
          toSlot: "lower-house",
          relation: "reviews",
          defaultBasis: "characteristic of a directorial system's judicial review convention",
        },
      ],
    },
    {
      id: "constitutional-monarchy",
      systemType: "constitutional-monarchy",
      label: "Constitutional monarchy",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "lower-house", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "head-of-state",
          toSlot: "head-of-government",
          relation: "appoints",
          defaultBasis: "characteristic of a constitutional monarchy's ceremonial head-of-state appointment convention",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "lower-house",
          relation: "confidence",
          defaultBasis: "characteristic of a constitutional monarchy's confidence convention",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "lower-house",
          relation: "dissolves",
          defaultBasis: "characteristic of a constitutional monarchy's dissolution convention",
        },
        {
          fromSlot: "apex-court",
          toSlot: "lower-house",
          relation: "reviews",
          defaultBasis: "characteristic of a constitutional monarchy's judicial review convention",
        },
      ],
    },
    {
      id: "absolute-monarchy",
      systemType: "absolute-monarchy",
      label: "Absolute monarchy",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "consultative-council", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "head-of-state",
          toSlot: "cabinet",
          relation: "appoints",
          defaultBasis: "characteristic of an absolute monarchy's direct executive-appointment convention",
        },
        {
          fromSlot: "head-of-state",
          toSlot: "consultative-council",
          relation: "appoints",
          defaultBasis:
            "characteristic of an absolute monarchy's convention that a consultative body is appointed rather than elected, with no confidence relation over the executive",
        },
        {
          fromSlot: "head-of-state",
          toSlot: "apex-court",
          relation: "appoints",
          defaultBasis: "characteristic of an absolute monarchy's judicial appointment convention",
        },
      ],
    },
    {
      id: "one-party-state",
      systemType: "one-party",
      label: "One-party state (party-state parallel structure)",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "legislature", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
        { slot: "ruling-party-organ", branch: "other", tier: "national", kind: "other" },
      ],
      edges: [
        {
          fromSlot: "ruling-party-organ",
          toSlot: "head-of-state",
          relation: "elects",
          defaultBasis:
            "characteristic of a one-party system's convention that the ruling party's organ selects state leadership through a parallel party structure",
        },
        {
          fromSlot: "ruling-party-organ",
          toSlot: "legislature",
          relation: "confirms",
          defaultBasis:
            "characteristic of a one-party system's convention that the ruling party vets and confirms legislative candidates through a parallel party structure",
        },
        {
          fromSlot: "legislature",
          toSlot: "head-of-government",
          relation: "confirms",
          defaultBasis:
            "characteristic of a one-party system's convention that the legislature formally ratifies the head of government's appointment, with no confidence relation in practice",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "cabinet",
          relation: "appoints",
          defaultBasis: "characteristic of a one-party system's cabinet-formation convention",
        },
      ],
    },
    {
      id: "military-junta-provisional",
      systemType: "military-junta",
      label: "Military junta / provisional government",
      institutions: [
        { slot: "junta-council", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "transitional-legislature", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "junta-council",
          toSlot: "transitional-legislature",
          relation: "dissolves",
          defaultBasis:
            "characteristic of a military junta or provisional government's convention that the ruling council may suspend or dissolve the legislature unilaterally",
        },
        {
          fromSlot: "junta-council",
          toSlot: "apex-court",
          relation: "appoints",
          defaultBasis:
            "characteristic of a military junta or provisional government's convention that the ruling council appoints the judiciary directly",
        },
      ],
    },
    {
      id: "theocratic",
      systemType: "other",
      label: "Theocratic",
      institutions: [
        { slot: "supreme-religious-authority", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "legislature", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "religious-oversight-council", branch: "other", tier: "national", kind: "other" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "supreme-religious-authority",
          toSlot: "head-of-government",
          relation: "appoints",
          defaultBasis:
            "characteristic of a theocratic system's convention that the supreme religious authority appoints the day-to-day head of government",
        },
        {
          fromSlot: "religious-oversight-council",
          toSlot: "legislature",
          relation: "vetoes",
          defaultBasis:
            "characteristic of a theocratic system's convention that a religious oversight body may veto legislation for doctrinal compliance",
        },
        {
          fromSlot: "legislature",
          toSlot: "head-of-government",
          relation: "confirms",
          defaultBasis:
            "characteristic of a theocratic system's convention that the legislature formally confirms the head of government",
        },
        {
          fromSlot: "supreme-religious-authority",
          toSlot: "apex-court",
          relation: "appoints",
          defaultBasis: "characteristic of a theocratic system's judicial appointment convention",
        },
      ],
    },
    {
      id: "assembly-elected-president-hybrid",
      systemType: "other",
      label: "Assembly-elected-president hybrid",
      institutions: [
        { slot: "legislature", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "cabinet", branch: "executive", tier: "national", kind: "cabinet" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "legislature",
          toSlot: "head-of-state",
          relation: "elects",
          defaultBasis:
            "characteristic of an assembly-elected-president hybrid system's convention that the legislature elects the head of state rather than the electorate directly",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "legislature",
          relation: "confidence",
          defaultBasis:
            "characteristic of an assembly-elected-president hybrid system's convention that the legislature that elected the head of state may also unseat the head of government",
        },
        {
          fromSlot: "head-of-state",
          toSlot: "legislature",
          relation: "dissolves",
          defaultBasis: "characteristic of an assembly-elected-president hybrid system's dissolution convention",
        },
        {
          fromSlot: "head-of-state",
          toSlot: "cabinet",
          relation: "appoints",
          defaultBasis: "characteristic of an assembly-elected-president hybrid system's cabinet-formation convention",
        },
        {
          fromSlot: "apex-court",
          toSlot: "legislature",
          relation: "reviews",
          defaultBasis: "characteristic of an assembly-elected-president hybrid system's judicial review convention",
        },
      ],
    },
    {
      id: "generic-fallback",
      systemType: "other",
      label: "Generic/other fallback",
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
        { slot: "legislature", branch: "legislative", tier: "national", kind: "chamber" },
        { slot: "apex-court", branch: "judicial", tier: "national", kind: "apex-court" },
      ],
      edges: [
        {
          fromSlot: "head-of-government",
          toSlot: "legislature",
          relation: "confidence",
          defaultBasis:
            "characteristic of a generic representative-government template used when no more specific archetype fits",
        },
        {
          fromSlot: "head-of-government",
          toSlot: "legislature",
          relation: "dissolves",
          defaultBasis:
            "characteristic of a generic representative-government template used when no more specific archetype fits",
        },
        {
          fromSlot: "apex-court",
          toSlot: "legislature",
          relation: "reviews",
          defaultBasis:
            "characteristic of a generic representative-government template used when no more specific archetype fits",
        },
      ],
    },
  ];
}

export function buildGovernmentArchetypeLibrary(): GovArchetypeLibrary {
  return { version: 1, archetypes: buildGovernmentArchetypes() };
}
