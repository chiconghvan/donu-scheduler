use crate::models::ProfileSummary;

pub struct GpmLoginClient {
    pub base_url: String,
}

fn display_browser_type(raw: Option<&str>) -> Option<String> {
    raw.map(|value| {
        if value.eq_ignore_ascii_case("camoufox") {
            "Firefox"
        } else {
            "Chrome"
        }
        .to_string()
    })
}

impl GpmLoginClient {
    pub fn new(base_url: String) -> Self {
        Self { base_url }
    }

    /// Fetch all groups from GPM Standard API (v3).
    /// GET {base_url}/api/v3/groups
    async fn list_groups(&self) -> Result<Vec<(i64, String)>, String> {
        let url = format!("{}/api/v3/groups", self.base_url);
        let resp = reqwest::get(&url)
            .await
            .map_err(|e| format!("GPM groups request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("GPM groups returned status: {}", resp.status()));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("GPM groups parse error: {e}"))?;

        let data = body["data"]
            .as_array()
            .ok_or_else(|| "GPM groups: 'data' is not an array".to_string())?;

        let mut groups = Vec::new();
        for g in data {
            if let (Some(id), Some(name)) = (g["id"].as_i64(), g["name"].as_str()) {
                groups.push((id, name.to_string()));
            }
        }
        Ok(groups)
    }

    /// List ALL profiles from GPM Standard API (v3), with pagination.
    /// Also fetches groups to resolve group_id -> group_name.
    pub async fn list_profiles(&self) -> Result<Vec<ProfileSummary>, String> {
        // Fetch groups first
        let groups = self.list_groups().await.unwrap_or_default();
        let group_map: std::collections::HashMap<i64, String> = groups.into_iter().collect();

        let mut all_profiles = Vec::new();
        let mut page = 1;

        loop {
            let url = format!(
                "{}/api/v3/profiles?page={}&per_page=100",
                self.base_url, page
            );
            let resp = reqwest::get(&url)
                .await
                .map_err(|e| format!("GPM request failed: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("GPM returned status: {}", resp.status()));
            }

            let body: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("GPM parse error: {e}"))?;

            let data = body["data"]
                .as_array()
                .ok_or_else(|| "GPM: 'data' is not an array".to_string())?;

            for p in data {
                if let (Some(id), Some(name)) = (p["id"].as_str(), p["name"].as_str()) {
                    let group_name = p["group_id"]
                        .as_i64()
                        .and_then(|gid| group_map.get(&gid).cloned());

                    all_profiles.push(ProfileSummary {
                        id: id.to_string(),
                        name: name.to_string(),
                        manager: "gpm".to_string(),
                        group_name,
                        browser_type: display_browser_type(p["browser_type"].as_str()),
                    });
                }
            }

            // Check pagination
            let total_page = body["pagination"]["total_page"].as_i64().unwrap_or(1);
            if page >= total_page {
                break;
            }
            page += 1;
        }

        Ok(all_profiles)
    }

    /// Verify a GPMLogin profile exists.
    /// GET {base_url}/api/v3/profile/{id}
    pub async fn profile_exists(&self, profile_id: &str) -> Result<bool, String> {
        let urls = [
            format!("{}/api/v3/profile/{}", self.base_url, profile_id),
            format!("{}/api/v3/profiles/{}", self.base_url, profile_id),
        ];

        let mut saw_not_found = false;
        for url in urls {
            let resp = reqwest::get(&url)
                .await
                .map_err(|e| format!("GPM profile verify request failed: {e}"))?;

            if resp.status() == reqwest::StatusCode::NOT_FOUND {
                saw_not_found = true;
                continue;
            }
            if !resp.status().is_success() {
                return Err(format!(
                    "GPM profile verify returned status: {}",
                    resp.status()
                ));
            }

            let text = resp
                .text()
                .await
                .map_err(|e| format!("GPM profile verify read body error: {e}"))?;

            if let Ok(body) = serde_json::from_str::<serde_json::Value>(&text) {
                return Ok(body["success"].as_bool().unwrap_or(false)
                    && body["data"]["id"].as_str() == Some(profile_id));
            }
            // parse failed — try next URL if available
        }

        if saw_not_found {
            Ok(false)
        } else {
            Err("GPM profile verify failed: all endpoints returned unparseable responses"
                .to_string())
        }
    }

    /// Close a running GPM profile.
    /// GET {base_url}/api/v3/profiles/close/{id}
    pub async fn close_profile(&self, profile_id: &str) -> Result<(), String> {
        let url = format!("{}/api/v3/profiles/close/{}", self.base_url, profile_id);
        let resp = reqwest::get(&url)
            .await
            .map_err(|e| format!("GPM close profile request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!(
                "GPM close profile returned status: {}",
                resp.status()
            ));
        }

        Ok(())
    }
}
