const router = require('express').Router();
const os = require('os');

// GET /api/admin/portal-address
//
// The addresses this server is actually reachable at right now.
//
// A guest voucher is printed with the host the admin panel was open at, and a
// phone that cannot reach that host gets nowhere with it. The panel has
// no way to test that from the browser — every address it might name answers
// fine from the machine itself, including one on a network interface that is
// unplugged, because Windows keeps serving a disconnected adapter's own IP
// back to loopback. Asking the server settles it: os.networkInterfaces() drops
// an interface the moment its link goes down, so an address missing from this
// list is an address no phone on any network can reach.
//
// Loopback is excluded deliberately — localhost names the *guest's own phone*, so
// a code built from it can never open.
router.get('/', (req, res) => {
  const addresses = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface || []) {
      if (addr.family === 'IPv4' && !addr.internal) addresses.push(addr.address);
    }
  }
  res.json({ addresses });
});

module.exports = router;
