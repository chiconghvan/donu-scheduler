pub mod donutbrowser_client;
pub mod gpmglobal_client;
pub mod gpmlogin_client;

use crate::models::ProfileSummary;

#[allow(dead_code)]
pub trait ProfileManagerClient {
    fn list_profiles(&self) -> Result<Vec<ProfileSummary>, String>;
    fn get_profile(&self, profile_id: &str) -> Result<Option<ProfileSummary>, String>;
}
