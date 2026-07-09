use crate::models::ProfileSummary;

pub struct GpmGlobalClient {
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

impl GpmGlobalClient {
    pub fn new(base_url: String) -> Self {
        Self { base_url }
    }

    async fn list_groups(&self) -> Result<Vec<(String, String)>, String> {
        let mut groups = Vec::new();
        let mut page = 1;

        loop {
            let url = format!(
                "{}/api/v1/groups?page={}&page_size=100",
                self.base_url, page
            );
            let resp = reqwest::get(&url)
                .await
                .map_err(|e| format!("GPMGlobal groups request failed: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!(
                    "GPMGlobal groups returned status: {}",
                    resp.status()
                ));
            }

            let body: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("GPMGlobal groups parse error: {e}"))?;

            let data = body["data"]["data"]
                .as_array()
                .ok_or_else(|| "GPMGlobal groups: 'data.data' is not an array".to_string())?;

            for g in data {
                if let (Some(id), Some(name)) = (g["id"].as_str(), g["name"].as_str()) {
                    groups.push((id.to_string(), name.to_string()));
                }
            }

            let current_page = body["data"]["current_page"].as_i64().unwrap_or(1);
            let last_page = body["data"]["last_page"].as_i64().unwrap_or(1);
            if current_page >= last_page {
                break;
            }
            page += 1;
        }

        Ok(groups)
    }

    pub async fn list_profiles(&self) -> Result<Vec<ProfileSummary>, String> {
        let groups = self.list_groups().await.unwrap_or_default();
        let group_map: std::collections::HashMap<String, String> = groups.into_iter().collect();

        let mut all_profiles = Vec::new();
        let mut page = 1;

        loop {
            let url = format!(
                "{}/api/v1/profiles?page={}&page_size=100",
                self.base_url, page
            );
            let resp = reqwest::get(&url)
                .await
                .map_err(|e| format!("GPMGlobal request failed: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("GPMGlobal returned status: {}", resp.status()));
            }

            let body: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("GPMGlobal parse error: {e}"))?;

            let data = body["data"]["data"]
                .as_array()
                .ok_or_else(|| "GPMGlobal: 'data.data' is not an array".to_string())?;

            for p in data {
                if let (Some(id), Some(name)) = (p["id"].as_str(), p["name"].as_str()) {
                    let group_name = p["group_id"]
                        .as_str()
                        .and_then(|gid| group_map.get(gid).cloned());

                    all_profiles.push(ProfileSummary {
                        id: id.to_string(),
                        name: name.to_string(),
                        manager: "gpmglobal".to_string(),
                        group_name,
                        browser_type: display_browser_type(p["browser"]["name"].as_str()),
                    });
                }
            }

            let current_page = body["data"]["current_page"].as_i64().unwrap_or(1);
            let last_page = body["data"]["last_page"].as_i64().unwrap_or(1);
            if current_page >= last_page {
                break;
            }
            page += 1;
        }

        Ok(all_profiles)
    }

    /// Verify a GPMGlobal profile exists.
    /// GET {base_url}/api/v1/profiles/{id}
    pub async fn profile_exists(&self, profile_id: &str) -> Result<bool, String> {
        let url = format!("{}/api/v1/profiles/{}", self.base_url, profile_id);
        let resp = reqwest::get(&url)
            .await
            .map_err(|e| format!("GPMGlobal profile verify request failed: {e}"))?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(false);
        }
        if !resp.status().is_success() {
            return Err(format!(
                "GPMGlobal profile verify returned status: {}",
                resp.status()
            ));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("GPMGlobal profile verify parse error: {e}"))?;
        Ok(body["success"].as_bool().unwrap_or(false)
            && body["data"]["id"].as_str() == Some(profile_id))
    }

    pub async fn close_profile(&self, profile_id: &str) -> Result<(), String> {
        let url = format!("{}/api/v1/profiles/stop/{}", self.base_url, profile_id);
        let resp = reqwest::get(&url)
            .await
            .map_err(|e| format!("GPMGlobal stop profile request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!(
                "GPMGlobal stop profile returned status: {}",
                resp.status()
            ));
        }

        Ok(())
    }
}
