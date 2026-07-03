use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubReleaseAsset {
    pub id: u64,
    pub name: String,
    pub browser_download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub assets: Vec<GithubReleaseAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptInstallRecord {
    pub store_script_id: String,
    pub script_db_id: String,
    pub name: String,
    pub version: String,
    pub sha256: String,
    pub runtime: String,
    pub source_owner: String,
    pub source_repo: String,
    pub source_tag: String,
    pub asset_name: String,
    pub installed_path: String,
    pub pending_path: Option<String>,
    pub pending_version: Option<String>,
    pub pending_sha256: Option<String>,
    pub pending_source_tag: Option<String>,
    pub pending_asset_name: Option<String>,
    pub installed_at: String,
    pub updated_at: String,
}
