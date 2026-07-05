use crate::models::ProfileSummary;

pub struct DonutBrowserClient {
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

impl DonutBrowserClient {
    pub fn new(base_url: String) -> Self {
        Self { base_url }
    }

    /// Fetch all groups from Donut Browser API.
    /// GET {base_url}/v1/groups
    async fn list_groups(&self) -> Result<Vec<(String, String)>, String> {
        let url = format!("{}/v1/groups", self.base_url);
        let resp = reqwest::get(&url)
            .await
            .map_err(|e| format!("Donut Browser groups request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Donut Browser groups returned status: {}",
                resp.status()
            ));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Donut Browser groups parse error: {e}"))?;

        let data = body
            .as_array()
            .ok_or_else(|| "Donut Browser groups: response is not an array".to_string())?;

        let mut groups = Vec::new();
        for g in data {
            if let (Some(id), Some(name)) = (g["id"].as_str(), g["name"].as_str()) {
                groups.push((id.to_string(), name.to_string()));
            }
        }
        Ok(groups)
    }

    /// List all profiles from Donut Browser REST API.
    /// GET {base_url}/v1/profiles
    /// Fetches groups to resolve group_id -> group_name.
    pub async fn list_profiles(&self) -> Result<Vec<ProfileSummary>, String> {
        // Fetch groups first
        let groups = self.list_groups().await.unwrap_or_default();
        let group_map: std::collections::HashMap<String, String> = groups.into_iter().collect();

        let url = format!("{}/v1/profiles", self.base_url);
        let resp = reqwest::get(&url)
            .await
            .map_err(|e| format!("Donut Browser request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("Donut Browser returned status: {}", resp.status()));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Donut Browser parse error: {e}"))?;

        let data = body["profiles"]
            .as_array()
            .ok_or_else(|| "Donut Browser: 'profiles' is not an array".to_string())?;

        let mut profiles = Vec::new();
        for p in data {
            if let (Some(id), Some(name)) = (p["id"].as_str(), p["name"].as_str()) {
                let group_name = p["group_id"]
                    .as_str()
                    .and_then(|gid| group_map.get(gid).cloned());

                profiles.push(ProfileSummary {
                    id: id.to_string(),
                    name: name.to_string(),
                    manager: "donut".to_string(),
                    group_name,
                    browser_type: display_browser_type(p["browser"].as_str()),
                });
            }
        }

        Ok(profiles)
    }

    /// Kill a running Donut Browser profile.
    /// POST {base_url}/v1/profiles/{id}/kill
    pub async fn close_profile(&self, profile_id: &str) -> Result<(), String> {
        let url = format!("{}/v1/profiles/{}/kill", self.base_url, profile_id);
        let client = reqwest::Client::new();
        let resp = client
            .post(&url)
            .send()
            .await
            .map_err(|e| format!("Donut Browser close profile request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Donut Browser close profile returned status: {}",
                resp.status()
            ));
        }

        Ok(())
    }
}
