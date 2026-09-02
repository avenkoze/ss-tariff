use std::collections::BTreeSet;

use sha2::{Digest, Sha256};

use crate::models::VisualFingerprint;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractedEntity {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub normalized: String,
}

pub fn learning_features(
    text: &str,
    width: u32,
    height: u32,
    fingerprint: Option<&VisualFingerprint>,
) -> BTreeSet<String> {
    let mut features = BTreeSet::new();
    for token in tokens(text).into_iter().take(80) {
        features.insert(format!("word:{token}"));
        let stem = token.chars().take(5).collect::<String>();
        if stem.chars().count() >= 4 {
            features.insert(format!("stem:{stem}"));
        }
    }
    if width > 0 && height > 0 {
        let ratio = width as f64 / height as f64;
        let shape = if ratio < 0.65 {
            "tall"
        } else if ratio > 1.55 {
            "wide"
        } else {
            "balanced"
        };
        features.insert(format!("shape:{shape}"));
    }
    if let Some(fingerprint) = fingerprint {
        let tone = if fingerprint.mean_luminance < 70.0 {
            "dark"
        } else if fingerprint.mean_luminance > 190.0 {
            "light"
        } else {
            "mid"
        };
        let texture = if fingerprint.luminance_deviation < 18.0 {
            "flat"
        } else if fingerprint.luminance_deviation > 70.0 {
            "busy"
        } else {
            "normal"
        };
        features.insert(format!("tone:{tone}"));
        features.insert(format!("texture:{texture}"));
    }
    features
}

pub fn extract_entities(text: &str) -> Vec<ExtractedEntity> {
    let mut entities = BTreeSet::<(String, String, String)>::new();
    let pieces = text
        .split_whitespace()
        .map(clean_piece)
        .filter(|piece| !piece.is_empty());

    for piece in pieces {
        let lowered = piece.to_lowercase();
        if (lowered.starts_with("http://")
            || lowered.starts_with("https://")
            || lowered.starts_with("www."))
            && lowered.len() <= 240
        {
            entities.insert(("link".into(), piece.clone(), lowered.clone()));
            if let Some(domain) = domain_from_url(&lowered) {
                entities.insert(("domain".into(), domain.clone(), domain));
            }
        } else if looks_like_email(&lowered) {
            entities.insert(("email".into(), piece.clone(), lowered));
        } else if lowered.starts_with('@') && lowered.len() >= 3 && lowered.len() <= 40 {
            entities.insert(("handle".into(), piece.clone(), lowered));
        } else if looks_like_date(&lowered) {
            entities.insert(("date".into(), piece.clone(), lowered));
        } else if looks_like_price(&lowered) {
            entities.insert(("price".into(), piece.clone(), lowered));
        }
    }

    entities
        .into_iter()
        .map(|(kind, name, normalized)| ExtractedEntity {
            id: stable_entity_id(&kind, &normalized),
            kind,
            name,
            normalized,
        })
        .collect()
}

fn tokens(text: &str) -> BTreeSet<String> {
    text.to_lowercase()
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| (2..=32).contains(&token.chars().count()))
        .map(str::to_string)
        .collect()
}

fn clean_piece(piece: &str) -> String {
    piece
        .trim_matches(|character: char| {
            matches!(
                character,
                ',' | ';' | '!' | '?' | '(' | ')' | '[' | ']' | '"' | '\''
            )
        })
        .to_string()
}

fn domain_from_url(value: &str) -> Option<String> {
    let without_scheme = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"))
        .unwrap_or(value);
    let domain = without_scheme
        .strip_prefix("www.")
        .unwrap_or(without_scheme)
        .split(['/', ':', '?', '#'])
        .next()?
        .trim_end_matches('.');
    (domain.contains('.') && domain.len() <= 100).then(|| domain.to_string())
}

fn looks_like_email(value: &str) -> bool {
    let Some((name, domain)) = value.split_once('@') else {
        return false;
    };
    !name.is_empty() && domain.contains('.') && !domain.contains('@') && value.len() <= 160
}

fn looks_like_date(value: &str) -> bool {
    let separators = ['.', '/', '-'];
    separators.iter().any(|separator| {
        let parts = value.split(*separator).collect::<Vec<_>>();
        (parts.len() == 2 || parts.len() == 3)
            && parts.iter().all(|part| {
                !part.is_empty()
                    && part.len() <= 4
                    && part.chars().all(|character| character.is_ascii_digit())
            })
    })
}

fn looks_like_price(value: &str) -> bool {
    let has_currency = value.contains('₺')
        || value.contains('$')
        || value.contains('€')
        || value.ends_with("tl")
        || value.ends_with("usd")
        || value.ends_with("eur");
    has_currency && value.chars().any(|character| character.is_ascii_digit()) && value.len() <= 32
}

fn stable_entity_id(kind: &str, normalized: &str) -> String {
    let digest = Sha256::digest(format!("{kind}:{normalized}").as_bytes());
    format!("entity-{}", hex::encode(&digest[..12]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_generic_context_without_domain_rules() {
        let entities =
            extract_entities("https://example.com/shoe ali@example.com @aven 12.09.2026 2.499₺");
        let kinds = entities
            .iter()
            .map(|entity| entity.kind.as_str())
            .collect::<BTreeSet<_>>();
        assert_eq!(
            kinds,
            BTreeSet::from(["date", "domain", "email", "handle", "link", "price"])
        );
    }

    #[test]
    fn learning_features_include_text_shape_and_tone() {
        let fingerprint = VisualFingerprint {
            mean_luminance: 35.0,
            luminance_deviation: 80.0,
            dark_pixel_ratio: 0.2,
            bright_pixel_ratio: 0.0,
        };
        let features = learning_features("Siyah ayakkabı", 1080, 2400, Some(&fingerprint));
        assert!(features.contains("word:ayakkabı"));
        assert!(features.contains("shape:tall"));
        assert!(features.contains("tone:dark"));
        assert!(features.contains("texture:busy"));
    }
}
