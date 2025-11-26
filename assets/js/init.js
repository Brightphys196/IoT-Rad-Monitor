(function () {
    const idToken = localStorage.getItem('idToken');
    if (idToken) {
        window.location.replace('/pages/profile.html');
    }
})();
