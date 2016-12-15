
$('document').ready(function() {
  $('#hamburger').on('click', function(e) {
    $('.post-archive').toggle();
    $('.post-wrapper').toggle();
    $('.post-archive').toggleClass("show-mobile");
    $('.post-wrapper').toggleClass("hide-mobile");
  });
});

$(window).resize(function() {
  if ($(window).width() > 768) {
    $('.post-archive').removeAttr("style");
    $('.post-wrapper').removeAttr("style");
    $('.post-archive').removeClass('show-mobile');
    $('.post-wrapper').removeClass('hide-mobile');
  }
});
