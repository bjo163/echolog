# ECHOLOG — Master Narrative
## MoonWitness XV · Domain D19 · Object Memory & Evidence Integrity

> **THE MOON WATCHES. THE RECORD REMEMBERS. THE EVIDENCE REMAINS INSPECTABLE.**
>
> **Preserve the Original. Prove the Integrity. Protect the Witness.**

**Document role:** Product narrative and identity authority for this repository.  
**Baseline reviewed:** 6 November 2026.  
**Parent ecosystem:** MoonWitness XV / Empire of the Light.  
**Domain:** D19 — Object Memory & Evidence Integrity.  
**Runtime home:** standalone repository `bjo163/echolog`; extracted from the MoonWitness XV monorepo.

---

## 1. What ECHOLOG is

**ECHOLOG is the memory layer of the MoonWitness ecosystem.** It preserves the original digital objects behind knowledge, research, stories, creative works, and human witness.

It provides a durable object identity, byte-level integrity, controlled access, lifecycle protection, and interoperable delivery surfaces. Its foundational object model is content-addressed: the SHA-256 digest identifies the bytes, and an existing object key cannot silently be replaced with different content.

ECHOLOG does not decide what is true, who is right, what a witness means, or whether a claim is justified. It preserves the digital material so that people and the domain applications they govern can inspect, verify, compare, and understand it.

ECHOLOG is a bounded MoonWitness service, not a second Hub and not the owner of every kind of data in the ecosystem.

## 2. Why it exists

Knowledge and witness systems depend on source material: manuscripts, documents, scans, photographs, recordings, datasets, research attachments, illustrations, and generated artifacts. If the underlying bytes silently change, disappear, or become detached from their provenance, downstream interpretation becomes harder to trust.

ECHOLOG addresses the storage part of this problem:

- Preserve original bytes independently of consumer application lifecycles.
- Give each byte sequence a verifiable content identity.
- Refuse silent replacement of immutable objects.
- Apply retention and legal-hold constraints fail-closed.
- Protect private-witness objects across every supported access alias.
- Provide consistent references to approved MoonWitness consumers.
- Keep storage operations inspectable and recoverable.

## 3. Place in MoonWitness XV

MoonWitness XV is a human-governed knowledge, witness, research, storytelling, and action ecosystem. Its north star is:

> Preserve the original. Trace each claim. Respect each perspective. Investigate openly. Create freely. Keep humans responsible.

ECHOLOG supports this promise by preserving the digital objects that those domains use. It does not replace their domain semantics.

| Ecosystem responsibility | Owner |
|---|---|
| Central Hub, orchestration, canonical ecosystem run state | ARSY |
| Global identity and authorization authority | D00 / ARSY |
| Original object bytes, digest identity, storage lifecycle | ECHOLOG / D19 |
| Source, passage, witness, research, story, and artifact meaning | Owning consumer domain |
| Human review, consent decisions, and governance | Authorized human-governance surfaces and domain owners |

Conceptual flow:

`MoonWitness XV → ARSY / D00 → ECHOLOG / D19 → approved consumer domains`

ARSY is the single central Hub. ECHOLOG must never become a second Hub, global identity authority, message broker, or agent runtime.

## 4. What ECHOLOG preserves

Examples of eligible objects include:

- Corpus source documents, editions, scans, and datasets.
- Witness photographs, audio, video, and supporting documents.
- Research papers, evidence attachments, tables, and reproducibility artifacts.
- Story and SHADOW illustrations, comic artwork, covers, and media.
- Dock posters and approved public assets.
- AI input artifacts and generated output files.
- Application exports and technical artifacts.

These are examples of consumer use, not a claim that every consumer integration is already live.

The owning domain remains responsible for object meaning, source attribution, rights, consent, classification, editorial state, and relationships. ECHOLOG stores the bytes and its storage-level metadata; it does not become a universal semantic catalog.

## 5. Core promise

### Identity
Every stored object has a content identity derived from its SHA-256 digest.

### Integrity
Original bytes are write-once at a given content address. Verification can establish whether bytes match a recorded digest; it does not establish the truth of their contents.

### Persistence
Objects and their storage metadata live on an explicit ECHOLOG storage volume. Persistence, backup, recovery, and replication must be verified independently; a filesystem volume alone is not a disaster-recovery strategy.

### Protection
Retention deadlines, legal holds, private-witness markers, authorization, and short-lived download grants establish explicit protection boundaries.

### Interoperability
REST and the intentionally bounded S3-compatible surface support application integrations. OCI distribution is an additional implemented protocol surface whose production readiness must be evaluated separately.

### Accountability
ECHOLOG reports storage and service events. Ecosystem-wide audit, rights, consent, and human decisions remain outside its authority.

## 6. Operating modes and identity

ECHOLOG is extracted and can run as a standalone service for development, controlled deployment, and independent storage operations. The standalone repository currently includes local operator identity backed by SQLite.

When integrated into MoonWitness, ARSY/D00 remains the ecosystem identity and authorization authority. Optional ARSY federation is present in the current service configuration. Local standalone credentials must not be mistaken for global MoonWitness identity.

The local identity store is an extraction/deployment accommodation and an explicit architectural deviation from the original XV ADR-0007 stateless contract. This deviation must remain documented and must not silently spread into consumer-domain identity ownership.

## 7. Four-field consumer reference

A consumer stores only:

`{ object_key, digest, size, content_type }`

The consumer owns the relationship between that reference and its domain record. It must not persist object bytes, long-lived download grants, ECHOLOG service secrets, or a searchable copy of ECHOLOG sidecar metadata as a second source of truth.

A grant is a temporary capability, not an object reference. Request a fresh grant when authorized access is needed.

## 8. What ECHOLOG is not

ECHOLOG is not:

- The MoonWitness Hub or global identity provider.
- A truth engine or authority over witness interpretation.
- A rights, consent, or case-management system.
- A generic cloud drive or consumer file manager.
- A universal database platform or Supabase replacement.
- A durable message broker or workflow scheduler.
- An agent execution platform.
- A replacement for Corpus, Witness, Research, Story, or other domain applications.
- A guarantee of off-site backup, disaster recovery, or regulatory compliance merely because objects are content-addressed.

Some experimental database, AI, realtime, sync, and platform modules currently exist in this repository. Their presence in source code does not automatically make them part of the accepted D19 core or production-certified capabilities. See the capability matrix and architecture boundary.

## 9. Product narrative

ECHOLOG is where MoonWitness keeps the original digital memory behind its knowledge, research, stories, and witnesses.

Every object carries an identity. Every byte can be checked against that identity. Every protected record has a boundary. Every consumer remains responsible for the meaning it assigns.

ECHOLOG preserves the material. MoonWitness domains investigate and interpret it. Humans remain responsible for decisions.

**ECHOLOG — The Memory Layer of MoonWitness.**  
**Preserve the Original. Prove the Integrity. Protect the Witness.**
