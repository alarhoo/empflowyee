output "service_urls" {
  value = { for name, service in module.service : name => service.uri }
}

output "service_names" {
  value = { for name, service in module.service : name => service.name }
}
