use fontique::Collection;

#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<String>, String> {
    let mut collection = Collection::default();
    let mut families: Vec<String> = collection
        .family_names()
        .map(|s| s.to_string())
        .collect();
    families.sort();
    families.dedup();
    Ok(families)
}
