function initKS($) {
  console.log(Knack);
  $(document).on("knack-view-render.any", function (event, view, data) {
    console.log("View rendered:", view.key);
  });
}
