# ECHOLOG — Master Narrative
## MoonWitness XV · D19 · Object Memory, Evidence Integrity & Digital Preservation

> **THE MOON WATCHES. THE RECORD REMEMBERS. THE EVIDENCE REMAINS INSPECTABLE.**
>
> **Preserve the Original. Verify the Bytes. Keep the Record Inspectable.**

**Role:** Product identity and narrative authority for this repository.  
**Parent ecosystem:** MoonWitness XV / Empire of the Light.  
**Domain:** D19.  
**Architecture authority:** MoonWitness XV ADR-0007 and docs/architecture/ECHOLOG.md.  
**Status:** Strategic direction; future capabilities are not automatically implemented.

## 1. The idea

ECHOLOG is the **Evidence Preservation Layer of MoonWitness**: a bounded service that preserves original digital objects and makes their storage integrity inspectable over time.

The objects may be manuscripts, source editions, scans, photographs, audio/video recordings, research papers, datasets, witness submissions, story artwork, generated media, or technical artifacts. Their meanings differ. Their bytes still need a dependable home.

ECHOLOG preserves the material. MoonWitness domains explain what the material means. Humans remain responsible for interpretation and decisions.

## 2. Why it exists

Digital knowledge can fail quietly: an original is overwritten; a file becomes detached from its source record; storage corruption goes unnoticed; an operator cannot explain when an object was received or checked; a provider disappears; a private witness object leaks through an overlooked protocol alias; or a backup exists but has never been restored.

A conventional object store solves only part of this. A digest detects byte mismatch when compared with a trusted recorded digest. Long-term preservation additionally needs clear receipts, fixity schedules, event records, portable packaging, recovery drills, and honest limits.

ECHOLOG makes these operations practical and inspectable without pretending to certify the truth of the content.

## 3. Position inside MoonWitness

MoonWitness XV is a human-governed knowledge, witness, research, storytelling, and action ecosystem. Its north star is:

> Preserve the original. Trace each claim. Respect each perspective. Investigate openly. Create freely. Keep humans responsible.

| Responsibility | Owner |
|---|---|
| Single central Hub and canonical run state | ARSY |
| Global identity and authorization authority | D00 / ARSY |
| Original bytes, digest, storage lifecycle and retrieval grants | ECHOLOG / D19 |
| Source, passage, witness, research, story and artifact meaning | Owning consumer domain |
| Rights, consent and editorial decisions | Domain owners and human governance |
| AI execution and model routing | Approved LUMEN / AI Gateway boundary |
| Durable workflows and messaging | ARSY / explicitly approved domain |

**ECHOLOG is not a second Hub.** It does not issue MoonWitness sessions, own global identity, execute agents, schedule workflows, or become a universal database.

## 4. The preservation lifecycle

The long-term product is organized around a lifecycle, not a collection of unrelated features.

1. **Deposit:** accept bytes through an authorized path, enforce limits, stream to a temporary location, calculate the digest, and publish atomically.
2. **Identify:** return a stable object reference and exact byte metadata.
3. **Receipt:** record a versioned storage receipt describing what ECHOLOG observed at ingest time.
4. **Protect:** apply retention, legal hold, privacy markers, scoped access, and short-lived grants.
5. **Verify:** re-read bytes and compare against the recorded digest; report verified, mismatch, inaccessible, or not-yet-checked states.
6. **Witness:** optionally publish signed checkpoints or transparency proofs so independent parties can detect later alteration or omission.
7. **Package:** export originals, manifests, checksums, and preservation metadata in documented portable formats.
8. **Recover:** restore to a separate destination and re-verify every object before declaring recovery successful.
9. **Migrate:** move storage backends without changing object identity or losing preservation history.

Only source-backed capabilities are current. Receipt signing, transparency checkpoints, portable package export, independent witnesses, scheduled verification, and backend migration are future capabilities requiring implementation and acceptance tests.

## 5. What the evidence can and cannot prove

| Mechanism | Can support | Cannot establish by itself |
|---|---|---|
| SHA-256 digest | Byte equality against a recorded digest | Truth, author, capture time, consent |
| Write-once object key | No silent replacement under that key | No deletion or operator misconduct |
| Ingest receipt | What the service recorded at receipt time | Whether uploader claims are true |
| Authenticated principal reference | Which service identity authenticated | Real-world identity beyond its authority |
| Signed timestamp/checkpoint | A signer attested to a record/checkpoint | Universal trusted time or completeness |
| Merkle inclusion proof | Entry is included in a committed log state | That every relevant event was submitted |
| Independent replicas | Availability across failure domains | Integrity unless each copy is checked |
| Fixity report | Result of a specific check at a specific time | Future availability or permanent correctness |

No screen, badge, export, or marketing copy may turn these limited statements into a truth score, authenticity verdict, chain-of-custody certification, or legal-admissibility claim.

## 6. Canonical consumer reference

Consumers store only:

~~~ts
{
  object_key: string
  digest: string
  size: number
  content_type: string
}
~~~

The owning domain keeps the relation between that reference and its own source, witness, passage, research record, rights, consent, or editorial state.

A future receipt or proof is a separate, versioned artifact referenced by a new optional contract field only after an upstream XV decision. Never silently expand the existing four-field contract.

## 7. What ECHOLOG preserves

Corpus source documents, editions, manuscripts and scans; witness photographs, audio, video and submitted documents; research papers, datasets, tables and reproducibility artifacts; Story and SHADOW illustrations, comic artwork, covers and approved media; Dock assets; AI input artifacts and generated outputs; and application exports.

These are intended consumer scenarios, not a claim that every integration is already live.

## 8. Product principles

- **Original first:** never transform, normalize, OCR, transcode, redact, or recompress the canonical original in place. Derivatives are new immutable objects linked to their source digest.
- **Integrity is not truth:** a correct hash means bytes match a reference; it does not make the content accurate.
- **Evidence without overclaiming:** receipts, events, timestamps, signatures and proofs state who asserted what and what was actually verified.
- **Portable by design:** an archive must not become hostage to one database, UI, storage vendor, or service operator.
- **Privacy by default:** private-witness objects remain private across REST, S3, OCI, tools, aliases, previews, search and logs.
- **Human governance:** rights, consent, interpretation, source quality and publication decisions remain with the owning domain and authorized humans.
- **Small core, optional edges:** do not absorb queues, workflows, global IAM, AI inference, generic database APIs, or analytics platforms merely because they are technically possible.

## 9. What ECHOLOG is not

ECHOLOG is not the MoonWitness Hub or global identity provider; a truth engine or witness judge; a rights, consent, case-management or editorial system; a generic cloud drive; a universal database or data lakehouse; a message broker, workflow scheduler or agent runtime; a replacement for Corpus, Witness, Research or Story; proof of legal admissibility; or a guarantee of indefinite availability because a file has a hash or blockchain entry.

Experimental AI, search, realtime, branching, sync, database, and platform modules do not automatically become D19 scope.

## 10. The future in one sentence

**ECHOLOG should let MoonWitness preserve an original today, verify it tomorrow, move it elsewhere years later, and still explain exactly what was preserved and what each verification did — without pretending that storage integrity is the same thing as truth.**

**ECHOLOG — The Evidence Preservation Layer of MoonWitness.**
