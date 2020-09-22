window.signup = function() {
  var cookieRegex = /(?:(?:^|.*;\s*)nateberkopecShowSignup\s*\=\s*([^;]*).*$)|^.*$/

  setTimeout(function(){
    if (document.cookie.match(cookieRegex, "$1")[1] !== "true") {
      showSignup();
    }
  }, 60000);

  function showSignup(){
    el = document.getElementById("innocuous");
    el.style.display = "block";
  }
};

signup();

document.addEventListener('pjax:complete', function () {signup()});

document.querySelectorAll("html")[0].addEventListener('click', function (event) {
    if (event.target.id === "innocuous-close") {
      document.getElementById("innocuous").style.display = "none";
      document.cookie = "nateberkopecShowSignup=true; expires=Fri, 31 Dec 9999 23:59:59 GMT;SameSite=Strict";
    }
  });