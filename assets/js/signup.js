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

  el = document.getElementById("innocuous-close");
  el.addEventListener("click", function() {
    document.getElementById("innocuous").style.display = "none";
    document.cookie = "nateberkopecShowSignup=true; expires=Fri, 31 Dec 9999 23:59:59 GMT";
  });
};

signup();

document.addEventListener('pjax:complete', function () {signup()});