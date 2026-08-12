use super::manager::PackInfo;
use crate::error::{AppError, AppResult};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

fn attribute_value(element: &BytesStart<'_>, key: &[u8]) -> Option<String> {
    element
        .attributes()
        .flatten()
        .find(|attr| attr.key.as_ref() == key)
        .map(|attr| String::from_utf8_lossy(&attr.value).into_owned())
}

pub fn parse_pdsc(content: &str) -> AppResult<PackInfo> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);

    let mut name = String::new();
    let mut vendor = String::new();
    let mut version = String::new();
    let mut description = String::new();
    let mut device_count = 0;
    let mut stack: Vec<Vec<u8>> = Vec::new();
    let mut devices_depth = None;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(element)) => {
                let tag = element.name().as_ref().to_vec();

                if tag.as_slice() == b"package" {
                    name = attribute_value(&element, b"name").unwrap_or(name);
                    vendor = attribute_value(&element, b"vendor").unwrap_or(vendor);
                    version = attribute_value(&element, b"version").unwrap_or(version);
                } else if tag.as_slice() == b"release" && version.is_empty() {
                    version = attribute_value(&element, b"version").unwrap_or_default();
                }

                stack.push(tag.clone());
                if tag.as_slice() == b"devices" {
                    devices_depth = Some(stack.len());
                } else if tag.as_slice() == b"device" && devices_depth.is_some() {
                    device_count += 1;
                }
            }
            Ok(Event::Empty(element)) => {
                let tag = element.name();
                if tag.as_ref() == b"package" {
                    name = attribute_value(&element, b"name").unwrap_or(name);
                    vendor = attribute_value(&element, b"vendor").unwrap_or(vendor);
                    version = attribute_value(&element, b"version").unwrap_or(version);
                } else if tag.as_ref() == b"release" && version.is_empty() {
                    version = attribute_value(&element, b"version").unwrap_or_default();
                } else if tag.as_ref() == b"device" && devices_depth.is_some() {
                    device_count += 1;
                }
            }
            Ok(Event::Text(text)) => {
                if stack.len() == 2 && stack[0].as_slice() == b"package" {
                    let value = text.unescape().unwrap_or_default();
                    match stack[1].as_slice() {
                        b"name" if name.is_empty() => name = value.into_owned(),
                        b"vendor" if vendor.is_empty() => vendor = value.into_owned(),
                        b"version" if version.is_empty() => version = value.into_owned(),
                        b"description" => description.push_str(&value),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(element)) => {
                if element.name().as_ref() == b"devices" && devices_depth == Some(stack.len()) {
                    devices_depth = None;
                }
                stack.pop();
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(AppError::PackError(format!("解析PDSC文件失败: {error}"))),
            _ => {}
        }
        buf.clear();
    }

    let pack_info = PackInfo {
        name: if name.is_empty() { "Unknown".into() } else { name },
        vendor: if vendor.is_empty() { "Unknown".into() } else { vendor },
        version: if version.is_empty() { "1.0.0".into() } else { version },
        description,
        device_count,
    };

    log::info!(
        "解析 PDSC 成功: {} / {} / {}，{} 个设备",
        pack_info.vendor,
        pack_info.name,
        pack_info.version,
        pack_info.device_count
    );
    Ok(pack_info)
}

#[cfg(test)]
mod tests {
    use super::parse_pdsc;

    #[test]
    fn parses_package_metadata_and_devices_in_one_pass() {
        let pdsc = r#"<package>
            <vendor>EmbeddedKit</vendor><name>DemoPack</name>
            <description>Demo devices</description>
            <releases><release version="1.2.3" /></releases>
            <devices><family><device Dname="DemoA" /><device Dname="DemoB"></device></family></devices>
        </package>"#;

        let info = parse_pdsc(pdsc).expect("PDSC should parse");
        assert_eq!(info.vendor, "EmbeddedKit");
        assert_eq!(info.name, "DemoPack");
        assert_eq!(info.version, "1.2.3");
        assert_eq!(info.description, "Demo devices");
        assert_eq!(info.device_count, 2);
    }
}
