# AdGuard Home for Student DNS Filtering

The application does not host AdGuard Home. Run AdGuard Home on a separate device with a stable IPv4 address that the MikroTik can reach. Reserve that address in DHCP or configure it statically, and allow DNS over both UDP and TCP port 53 from the student network.

## Configure AdGuard Home

1. Install and open the AdGuard Home web interface on the resolver device.
2. Configure working upstream DNS resolvers and confirm that the MikroTik can reach the AdGuard Home address.
3. Enable an adult-content blocklist or parental-control filtering in AdGuard Home. The application only redirects DNS; it does not choose or install blocklists.
4. Keep the AdGuard Home address reachable without requiring the student captive portal to authenticate first.

## Enable Filtering

1. In the admin console, open **Settings -> Website Filtering**.
2. Enter the AdGuard Home IPv4 address, switch student filtering on, and save.
3. Confirm that the save reports the MikroTik applied the change. If the router was unavailable, restore connectivity and save again from the Website Filtering section to retry.
4. Test from an authenticated student device. Check the AdGuard Home query log and verify that a domain on the enabled blocklist is blocked.

The backend maintains a tagged MikroTik address-list entry for authenticated student sessions and redirects their UDP/TCP DNS requests on port 53 to AdGuard Home. A narrowly matched source-NAT rule makes DNS replies work when AdGuard Home shares the client subnet; consequently, AdGuard Home may show the router address rather than each student's address in its query log. Faculty, staff, and guest sessions are not added to the filtering list. Turning filtering off removes the app-managed DNS redirect rules; it does not remove unrelated RouterOS rules.

## Limits

This enforces ordinary DNS only. DNS-over-HTTPS, DNS-over-TLS, VPNs, and direct connections to known IP addresses can bypass DNS-based filtering. AdGuard Home filtering is not a substitute for endpoint controls or a complete web access policy. Test captive-portal login, portal access, and normal browsing after enabling it.
